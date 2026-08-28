import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readdir, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";

const getS3ObjectStream = vi.fn();
vi.mock("@/modules/storage", () => ({ getS3ObjectStream: (...args: unknown[]) => getS3ObjectStream(...args) }));

// `vi.spyOn` ne peut pas redéfinir un export ESM (namespace non configurable) — on passe par
// un mock partiel dont `mkdir` peut être basculé en échec pour un seul test (repli disque → S3).
let mkdirShouldFail = false;
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    mkdir: (...args: Parameters<typeof actual.mkdir>) => {
      if (mkdirShouldFail) return Promise.reject(new Error("EACCES"));
      return actual.mkdir(...args);
    },
  };
});

function s3Body(content = "audio-bytes"): Readable {
  return Readable.from([Buffer.from(content)]);
}

let cacheDir: string;

/** Le module lit `AUDIO_CACHE_DIR`/`AUDIO_CACHE_MAX_BYTES` à l'import — réimporté à chaque test. */
async function importFreshModule() {
  vi.resetModules();
  return import("../rendition-cache");
}

describe("rendition-cache", () => {
  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "koinonia-audio-cache-test-"));
    process.env.AUDIO_CACHE_DIR = cacheDir;
    delete process.env.AUDIO_CACHE_MAX_BYTES;
    getS3ObjectStream.mockReset();
    getS3ObjectStream.mockImplementation(async () => s3Body());
    mkdirShouldFail = false;
  });

  afterEach(async () => {
    delete process.env.AUDIO_CACHE_DIR;
    delete process.env.AUDIO_CACHE_MAX_BYTES;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("télécharge au premier accès puis sert localement sans nouvel appel S3", async () => {
    const { getCachedRenditionPath } = await importFreshModule();

    const first = await getCachedRenditionPath("segments/a.mp3");
    expect(first).not.toBeNull();
    expect(getS3ObjectStream).toHaveBeenCalledTimes(1);

    const second = await getCachedRenditionPath("segments/a.mp3");
    expect(second).toBe(first);
    expect(getS3ObjectStream).toHaveBeenCalledTimes(1);
  });

  it("deux accès concurrents à la même clé ne déclenchent qu'un seul appel S3", async () => {
    const { getCachedRenditionPath } = await importFreshModule();

    const [a, b] = await Promise.all([
      getCachedRenditionPath("segments/b.mp3"),
      getCachedRenditionPath("segments/b.mp3"),
    ]);

    expect(a).toBe(b);
    expect(getS3ObjectStream).toHaveBeenCalledTimes(1);
  });

  it("une rendition pré-chauffée n'est jamais retéléchargée", async () => {
    const { getCachedRenditionPath, primeRenditionCache } = await importFreshModule();

    const sourcePath = path.join(cacheDir, "source.mp3");
    await writeFile(sourcePath, "pre-chauffée");
    await primeRenditionCache("segments/c.mp3", sourcePath);

    const cached = await getCachedRenditionPath("segments/c.mp3");

    expect(cached).not.toBeNull();
    expect(getS3ObjectStream).not.toHaveBeenCalled();
  });

  it("évince le fichier le moins récemment servi au dépassement du plafond", async () => {
    process.env.AUDIO_CACHE_MAX_BYTES = "20"; // quelques octets : force l'éviction dès le 2e fichier
    const { getCachedRenditionPath, getCacheFileName } = await importFreshModule();

    await getCachedRenditionPath("segments/old.mp3"); // le plus ancien, servi en premier
    // `atime` a une résolution large sur certains systèmes de fichiers — on l'espace explicitement.
    await new Promise((r) => setTimeout(r, 20));
    await getCachedRenditionPath("segments/new.mp3");

    const remaining = await readdir(cacheDir);
    const oldFile = getCacheFileName("segments/old.mp3");
    const newFile = getCacheFileName("segments/new.mp3");

    expect(remaining).not.toContain(oldFile);
    expect(remaining).toContain(newFile);
  });

  it("touchRenditionAccess rafraîchit l'horodatage sans échouer si le fichier est absent", async () => {
    const { getCachedRenditionPath, touchRenditionAccess, getCacheFileName } = await importFreshModule();

    await getCachedRenditionPath("segments/d.mp3");
    const filePath = path.join(cacheDir, getCacheFileName("segments/d.mp3"));
    const before = (await stat(filePath)).atimeMs;

    await new Promise((r) => setTimeout(r, 20));
    await touchRenditionAccess("segments/d.mp3");
    const after = (await stat(filePath)).atimeMs;

    expect(after).toBeGreaterThanOrEqual(before);
    await expect(touchRenditionAccess("segments/does-not-exist.mp3")).resolves.toBeUndefined();
  });

  it("repli sur null (donc sur S3 côté appelant) quand l'écriture disque échoue", async () => {
    const { getCachedRenditionPath } = await importFreshModule();
    mkdirShouldFail = true;

    const result = await getCachedRenditionPath("segments/e.mp3");

    expect(result).toBeNull();
  });
});
