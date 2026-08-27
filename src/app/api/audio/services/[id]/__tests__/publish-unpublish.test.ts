/**
 * T045 — Traçabilité (logAudit qui/quand/quoi) sur publish/unpublish, et : après unpublish,
 * GET /api/audio/public/[token] renvoie la réponse dédiée « inopérant » (T028) plutôt que
 * les métadonnées du culte.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAudioAccess = vi.fn();
const mockRequireAudioUnpublishAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAudioAccess: (...args: unknown[]) => mockRequireAudioAccess(...args),
  requireAudioUnpublishAccess: (...args: unknown[]) => mockRequireAudioUnpublishAccess(...args),
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({ getSignedStreamUrl: vi.fn() }));

const { POST: publishPost } = await import("../publish/route");
const { POST: unpublishPost } = await import("../unpublish/route");
const { GET: publicGet } = await import("../../../public/[token]/route");

const serviceId = "service-1";
const churchId = "church-1";
const token = "share-token-1";
const admin = createAdminSession(churchId);

function params() {
  return { params: Promise.resolve({ id: serviceId }) };
}

describe("Traçabilité publication/dépublication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
  });

  it("publish : journalise qui/quand/quoi via logAudit", async () => {
    mockRequireAudioAccess.mockResolvedValue(admin);
    const { computeSourceHash } = await import("@/modules/audio");
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: null,
      // rendition déjà à jour pour ce hash — republication directe sans job.
      segments: [{ id: "seg-1", source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: { sourceHash: computeSourceHash("etag-1") } }],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "PUBLISHED" } as never);

    const res = await publishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(res.status).toBe(200);

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: admin.user.id,
        churchId,
        action: "UPDATE",
        entityType: "AudioService",
        entityId: serviceId,
        details: expect.objectContaining({ action: "publish" }),
      })
    );
  });

  it("unpublish : journalise qui/quand/quoi via logAudit", async () => {
    mockRequireAudioUnpublishAccess.mockResolvedValue(admin);
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId, status: "PUBLISHED" } as never);
    prismaMock.audioService.update.mockResolvedValue({ id: serviceId, status: "UNPUBLISHED" } as never);

    const res = await unpublishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(res.status).toBe(200);

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: admin.user.id,
        churchId,
        action: "UPDATE",
        entityType: "AudioService",
        entityId: serviceId,
        details: expect.objectContaining({ action: "unpublish", status: "UNPUBLISHED" }),
      })
    );
  });

  it("après unpublish, le lien public renvoie la réponse « inopérant » (410) plutôt que les métadonnées", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      id: "tok-1",
      token,
      serviceId,
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "UNPUBLISHED", // état après dépublication
      coverKey: null,
      segments: [],
    } as never);

    const res = await publicGet(new Request("http://localhost"), { params: Promise.resolve({ token }) });

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/n'est plus disponible/i);
  });
});
