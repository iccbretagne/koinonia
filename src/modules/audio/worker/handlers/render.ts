import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { AudioJob } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadFile, uploadFile } from "@/modules/storage";
import { maybeCompletePublication } from "../../services/publish";
import { log, since, formatBytes } from "../log";

const execFileAsync = promisify(execFile);
const TARGET_LUFS = -16;
const TARGET_TP = -1;
const TARGET_LRA = 11;

interface RenderPayload {
  segmentId: string;
  sourceHash: string;
}

interface LoudnormMeasured {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

function getRenditionKey(serviceId: string, segmentId: string): string {
  return `audio-services/${serviceId}/renditions/${segmentId}.mp3`;
}

/** Passe de mesure `loudnorm` (dry-run vers /dev/null) — ffmpeg écrit le JSON sur stderr. */
async function measureLoudness(inputPath: string): Promise<LoudnormMeasured> {
  let stderr = "";
  try {
    const result = await execFileAsync("ffmpeg", [
      "-i", inputPath,
      "-af", `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
      "-f", "null", "-",
    ]);
    stderr = result.stderr;
  } catch (err) {
    // ffmpeg avec -f null sort en code non-zéro sur certaines versions même en succès ;
    // le JSON de mesure est de toute façon sur stderr, pas sur le code de retour.
    stderr = (err as { stderr?: string }).stderr ?? "";
  }
  const jsonStart = stderr.lastIndexOf("{");
  if (jsonStart === -1) throw new Error("loudnorm: mesure introuvable dans la sortie ffmpeg");
  return JSON.parse(stderr.slice(jsonStart, stderr.lastIndexOf("}") + 1));
}

/**
 * Job `RENDER` : `loudnorm` deux passes vers −16 LUFS, réencodage MP3, tags ID3, upload S3 et
 * écriture d'`AudioRendition`. Termine par `maybeCompletePublication` (D10 — passage
 * `READY` → `PUBLISHED` quand toutes les séquences du culte sont à jour).
 */
export async function renderHandler(job: AudioJob): Promise<void> {
  const payload = job.payload as unknown as RenderPayload | null;
  if (!payload?.segmentId) throw new Error("Job RENDER sans segmentId dans le payload");

  const segment = await prisma.audioSegment.findUnique({
    where: { id: payload.segmentId },
    include: { source: true, service: true },
  });
  if (!segment || !segment.source) {
    throw new Error(`Segment ${payload.segmentId} introuvable ou sans source associée`);
  }

  log(`rendu ${segment.id} « ${segment.title} » (culte ${segment.serviceId}) — début`);

  const dir = await mkdtemp(path.join(tmpdir(), "audio-render-"));
  try {
    const inputPath = path.join(dir, "input");
    const outputPath = path.join(dir, "output.mp3");

    // Chaque étape est chronométrée séparément : quand un rendu « n'avance pas », la question
    // utile est laquelle des trois (S3, mesure, encodage) est lente ou bloquée.
    let stepAt = Date.now();
    const buffer = await downloadFile(segment.source.s3Key);
    await writeFile(inputPath, buffer);
    log(
      `rendu ${segment.id} : source téléchargée (${formatBytes(buffer.length)}) en ${since(stepAt)}`
    );

    stepAt = Date.now();
    const measured = await measureLoudness(inputPath);
    log(`rendu ${segment.id} : mesure loudnorm en ${since(stepAt)} (${measured.input_i} LUFS)`);
    const service = segment.service;

    stepAt = Date.now();
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-af",
      `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:` +
        `measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
        `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:` +
        `offset=${measured.target_offset}:linear=true:print_format=summary`,
      "-metadata", `title=${segment.title}`,
      "-metadata", `album=${service.title ?? ""}`,
      "-metadata", `date=${service.serviceDate.toISOString().slice(0, 10)}`,
      "-metadata", `artist=${service.speaker ?? ""}`,
      "-metadata", `track=${segment.order}`,
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      outputPath,
    ]);

    const outputBuffer = await readFile(outputPath);
    log(
      `rendu ${segment.id} : encodage MP3 en ${since(stepAt)} ` +
        `(${formatBytes(outputBuffer.length)} produits)`
    );

    stepAt = Date.now();
    const key = getRenditionKey(segment.serviceId, segment.id);
    await uploadFile(key, outputBuffer, "audio/mpeg");
    log(`rendu ${segment.id} : rendu envoyé vers ${key} en ${since(stepAt)}`);

    const truePeakDb = parseFloat(measured.input_tp);
    await prisma.audioRendition.upsert({
      where: { segmentId: segment.id },
      create: {
        segmentId: segment.id,
        s3Key: key,
        format: "mp3",
        durationMs: segment.source.durationMs ?? 0,
        lufs: TARGET_LUFS,
        truePeakDb,
        sourceHash: payload.sourceHash,
      },
      update: {
        s3Key: key,
        durationMs: segment.source.durationMs ?? 0,
        lufs: TARGET_LUFS,
        truePeakDb,
        sourceHash: payload.sourceHash,
      },
    });

    const completion = await maybeCompletePublication(segment.serviceId);
    log(
      completion.published
        ? `culte ${segment.serviceId} : toutes les séquences sont prêtes — passé à PUBLISHED`
        : `culte ${segment.serviceId} : ${completion.remaining} séquence(s) encore à rendre`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
