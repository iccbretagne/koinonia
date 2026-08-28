/**
 * Route publique de streaming, réécrite pour servir depuis le cache disque au lieu de rediriger
 * en 302 vers S3 (spec 021) — le comportement d'accès (404/403/410) doit rester inchangé.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/audio", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/audio")>();
  return { ...original, buildRenditionResponse: vi.fn(async () => new Response("stream", { status: 200 })) };
});

const { GET } = await import("../route");
const audioModule = await import("@/modules/audio");

const token = "share-token";
const segmentId = "segment-1";
const serviceId = "service-1";

function params() {
  return { params: Promise.resolve({ token, segmentId }) };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/audio/public/[token]/stream/[segmentId]", () => {
  it("404 si le lien n'existe pas", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
  });

  it("404 si le lien a été révoqué", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: null,
      revokedAt: new Date(),
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
  });

  it("403 si le lien est restreint à une autre séquence", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: "other-segment",
      revokedAt: null,
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
  });

  it("404 si la séquence n'existe pas ou n'appartient pas au culte du lien", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
  });

  it("410 si le culte n'est plus publié", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({
      id: segmentId,
      serviceId,
      rendition: { s3Key: "segments/a.mp3" },
      service: { status: "DRAFT" },
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(410);
  });

  it("410 si la séquence n'a pas encore de rendu", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({
      id: segmentId,
      serviceId,
      rendition: null,
      service: { status: "PUBLISHED" },
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(410);
  });

  it("sert le flux via buildRenditionResponse quand tout est valide", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token,
      serviceId,
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({
      id: segmentId,
      serviceId,
      rendition: { s3Key: "segments/a.mp3" },
      service: { status: "PUBLISHED" },
    } as never);

    const res = await GET(new Request("http://localhost", { headers: { Range: "bytes=0-9" } }), params());

    expect(res.status).toBe(200);
    expect(audioModule.buildRenditionResponse).toHaveBeenCalledWith("segments/a.mp3", "bytes=0-9");
  });
});
