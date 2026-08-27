/**
 * T043 — handlers/render.ts avec un vrai ffmpeg sur une fixture de quelques secondes
 * (générée à la volée via `ffmpeg -f lavfi`, pas de binaire mocké) : vérifie le réencodage
 * MP3, la cible LUFS (-16) écrite en base, et les tags ID3.
 */
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const execFileAsync = promisify(execFile);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

let uploadedBuffer: Buffer | undefined;
let uploadedKey: string | undefined;
vi.mock("@/modules/storage", () => ({
  downloadFile: vi.fn(async () => sourceBuffer),
  uploadFile: vi.fn(async (key: string, body: Buffer) => {
    uploadedKey = key;
    uploadedBuffer = body;
  }),
}));

// Renvoie la forme réelle de PublicationCompletion : le handler journalise `published` /
// `remaining` après l'appel et casserait sur un mock qui renvoie undefined.
const mockMaybeCompletePublication = vi.fn(async (..._args: unknown[]) => ({
  published: true,
  remaining: 0,
}));
vi.mock("../../../services/publish", () => ({
  maybeCompletePublication: (...args: unknown[]) => mockMaybeCompletePublication(...args),
}));

const { renderHandler } = await import("../render");

let tmpDir: string;
let sourceBuffer: Buffer;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "audio-render-test-"));
  const fixturePath = path.join(tmpDir, "fixture.wav");
  // 2 secondes de sinusoïde à 440 Hz — suffisant pour que loudnorm mesure quelque chose.
  await execFileAsync("ffmpeg", [
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=2",
    "-ar", "44100",
    "-ac", "1",
    "-y",
    fixturePath,
  ]);
  sourceBuffer = await readFile(fixturePath);
}, 20_000);

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("renderHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadedBuffer = undefined;
    uploadedKey = undefined;
  });

  it("rejette un job RENDER sans segmentId dans le payload", async () => {
    await expect(
      renderHandler({ id: "job-1", serviceId: "service-1", type: "RENDER", payload: {} } as never)
    ).rejects.toThrow(/sans segmentId/);
  });

  it("réencode en MP3 à -16 LUFS, pose les tags ID3 et écrit l'AudioRendition", async () => {
    prismaMock.audioSegment.findUnique.mockResolvedValue({
      id: "seg-1",
      serviceId: "service-1",
      title: "Louange",
      order: 1,
      source: { s3Key: "audio-services/service-1/sources/src-1.wav", durationMs: 2000 },
      service: { title: "Culte du dimanche", speaker: "Pasteur Jean", serviceDate: new Date("2026-08-23") },
    } as never);
    prismaMock.audioRendition.upsert.mockResolvedValue({} as never);

    await renderHandler({
      id: "job-1",
      serviceId: "service-1",
      type: "RENDER",
      payload: { segmentId: "seg-1", sourceHash: "hash-abc" },
    } as never);

    // Rendition écrite avec la cible LUFS fixe et le sourceHash du payload (idempotence D10).
    expect(prismaMock.audioRendition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { segmentId: "seg-1" },
        create: expect.objectContaining({ segmentId: "seg-1", lufs: -16, sourceHash: "hash-abc", format: "mp3" }),
        update: expect.objectContaining({ lufs: -16, sourceHash: "hash-abc" }),
      })
    );
    expect(mockMaybeCompletePublication).toHaveBeenCalledWith("service-1");

    // Vérifie le fichier réellement produit par ffmpeg (pas de mock du binaire) : format MP3
    // et tags ID3 (titre/album/date/artiste/piste) posés depuis le segment/service.
    expect(uploadedKey).toBe("audio-services/service-1/renditions/seg-1.mp3");
    expect(uploadedBuffer).toBeInstanceOf(Buffer);

    const outputPath = path.join(tmpDir, "output-check.mp3");
    await writeFile(outputPath, uploadedBuffer!);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration:format_tags=title,album,date,artist,track",
      "-of", "json",
      outputPath,
    ]);
    const probed = JSON.parse(stdout) as {
      format: { format_name: string; tags?: Record<string, string> };
    };
    expect(probed.format.format_name).toContain("mp3");
    expect(probed.format.tags?.title).toBe("Louange");
    expect(probed.format.tags?.album).toBe("Culte du dimanche");
    expect(probed.format.tags?.artist).toBe("Pasteur Jean");
    expect(probed.format.tags?.date).toBe("2026-08-23");
  }, 20_000);
});
