import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const getCachedRenditionPath = vi.fn();
const getCacheFileName = vi.fn((s3Key: string) => `${s3Key.replace(/\//g, "_")}.mp3`);
const touchRenditionAccess = vi.fn();
const getS3ObjectStream = vi.fn();

vi.mock("../rendition-cache", () => ({
  getCachedRenditionPath: (...args: unknown[]) => getCachedRenditionPath(...args),
  getCacheFileName: (...args: [string]) => getCacheFileName(...args),
  touchRenditionAccess: (...args: unknown[]) => touchRenditionAccess(...args),
}));
vi.mock("@/modules/storage", () => ({ getS3ObjectStream: (...args: unknown[]) => getS3ObjectStream(...args) }));

const { buildRenditionResponse } = await import("../stream");

let dir: string;
let filePath: string;
const CONTENT = "0123456789"; // 10 octets, pratique pour vérifier les plages

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const buf = await new Response(res.body).arrayBuffer();
  return Buffer.from(buf).toString();
}

describe("buildRenditionResponse", () => {
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "koinonia-stream-test-"));
    filePath = path.join(dir, "rendition.mp3");
    await writeFile(filePath, CONTENT);
    getCachedRenditionPath.mockReset().mockResolvedValue(filePath);
    getCacheFileName.mockClear();
    touchRenditionAccess.mockReset();
    getS3ObjectStream.mockReset();
    delete process.env.AUDIO_XACCEL_LOCATION;
  });

  afterEach(async () => {
    delete process.env.AUDIO_XACCEL_LOCATION;
    await rm(dir, { recursive: true, force: true });
  });

  it("200 sans Range, avec les en-têtes de cache", async () => {
    const res = await buildRenditionResponse("segments/a.mp3", null);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await readBody(res)).toBe(CONTENT);
  });

  it("206 avec Content-Range correct pour une plage valide", async () => {
    const res = await buildRenditionResponse("segments/a.mp3", "bytes=2-5");

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 2-5/${CONTENT.length}`);
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(await readBody(res)).toBe("2345");
  });

  it("416 sur une plage invalide", async () => {
    const res = await buildRenditionResponse("segments/a.mp3", "bytes=50-60");

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${CONTENT.length}`);
  });

  it("replie sur le flux S3 direct si le cache est indisponible", async () => {
    getCachedRenditionPath.mockResolvedValue(null);
    const { Readable } = await import("stream");
    getS3ObjectStream.mockResolvedValue(Readable.from([Buffer.from(CONTENT)]));

    const res = await buildRenditionResponse("segments/a.mp3", null);

    expect(res.status).toBe(200);
    expect(getS3ObjectStream).toHaveBeenCalledWith("segments/a.mp3");
  });

  it("avec AUDIO_XACCEL_LOCATION défini : corps vide + X-Accel-Redirect sur le bon fichier, mtime rafraîchi", async () => {
    process.env.AUDIO_XACCEL_LOCATION = "/protected/audio";

    const res = await buildRenditionResponse("segments/a.mp3", "bytes=2-5");

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Accel-Redirect")).toBe(`/protected/audio/${getCacheFileName("segments/a.mp3")}`);
    expect(touchRenditionAccess).toHaveBeenCalledWith("segments/a.mp3");
    expect(getCachedRenditionPath).not.toHaveBeenCalled(); // délégué à nginx, pas de lecture locale ici
    expect(await readBody(res)).toBe("");
  });
});
