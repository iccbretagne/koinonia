import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { AudioJob } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/modules/storage";
import { log, since } from "../log";

const execFileAsync = promisify(execFile);

interface FfprobeOutput {
  format?: { duration?: string };
}

/**
 * Job `PROBE` : mesure la durée (`durationMs`) des `AudioSource(kind: SEQUENCE)` du culte
 * dont l'upload est terminé mais pas encore sondées, via `ffprobe`.
 */
export async function probeHandler(job: AudioJob): Promise<void> {
  const sources = await prisma.audioSource.findMany({
    where: { serviceId: job.serviceId, uploadStatus: "DONE", durationMs: null },
  });
  if (sources.length === 0) {
    // Cas normal quand la sonde a déjà tourné — mais le dire évite de confondre « rien à
    // faire » avec « le handler n'a jamais été appelé ».
    log(`sonde du culte ${job.serviceId} : aucune source à mesurer`);
    return;
  }
  log(`sonde du culte ${job.serviceId} : ${sources.length} source(s) à mesurer`);

  const dir = await mkdtemp(path.join(tmpdir(), "audio-probe-"));
  try {
    for (const source of sources) {
      const startedAt = Date.now();
      const buffer = await downloadFile(source.s3Key);
      const localPath = path.join(dir, source.id);
      await writeFile(localPath, buffer);

      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        localPath,
      ]);
      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const durationSeconds = parseFloat(parsed.format?.duration ?? "0");

      const durationMs = Math.round(durationSeconds * 1000);
      await prisma.audioSource.update({
        where: { id: source.id },
        data: { durationMs },
      });
      log(
        `sonde ${source.id} (${source.originalFilename ?? source.s3Key}) : ` +
          `${Math.round(durationMs / 1000)} s de contenu, mesuré en ${since(startedAt)}`
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
