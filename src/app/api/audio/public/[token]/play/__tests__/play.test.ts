/**
 * Tests — spec 029 (M-04) : le comptage de lecture suit la meme regle de disponibilite que
 * l'ecoute elle-meme.
 *
 * Le streaming refuse deja un culte depublie (410) ; le compteur, lui, restait incrementable
 * par tout detenteur d'un ancien lien non revoque. L'increment est desormais conditionne au
 * statut publie DANS la meme instruction, ce qui ferme aussi la fenetre entre controle et
 * ecriture.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("203.0.113.1"),
  RATE_LIMIT_MUTATION: { windowMs: 60_000, max: 30 },
}));

const { POST } = await import("../route");

const params = Promise.resolve({ token: "tok-1" });

function playRequest(segmentId = "seg-1"): Request {
  return new Request("http://localhost/api/audio/public/tok-1/play", {
    method: "POST",
    body: JSON.stringify({ segmentId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.audioShareToken.findUnique.mockResolvedValue({
    token: "tok-1",
    serviceId: "svc-1",
    segmentId: null,
    revokedAt: null,
  } as never);
});

describe("POST /api/audio/public/[token]/play", () => {
  it("culte publié — incrémente en une seule instruction conditionnée au statut PUBLISHED", async () => {
    prismaMock.audioSegment.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(playRequest(), { params });

    expect(res.status).toBe(200);
    expect(prismaMock.audioSegment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "seg-1",
        serviceId: "svc-1",
        service: { status: "PUBLISHED" },
      },
      data: { playCount: { increment: 1 } },
    });
  });

  it("culte dépublié — aucune ligne touchée, réponse 410 alignée sur le streaming", async () => {
    prismaMock.audioSegment.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(playRequest(), { params });

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("Ce culte n'est plus disponible.");
  });

  it("jeton révoqué — 404, aucun comptage tenté", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token: "tok-1",
      serviceId: "svc-1",
      segmentId: null,
      revokedAt: new Date(),
    } as never);

    const res = await POST(playRequest(), { params });

    expect(res.status).toBe(404);
    expect(prismaMock.audioSegment.updateMany).not.toHaveBeenCalled();
  });

  it("segment hors périmètre d'un lien ciblé — 403, aucun comptage tenté", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token: "tok-1",
      serviceId: "svc-1",
      segmentId: "seg-autorise",
      revokedAt: null,
    } as never);

    const res = await POST(playRequest("seg-1"), { params });

    expect(res.status).toBe(403);
    expect(prismaMock.audioSegment.updateMany).not.toHaveBeenCalled();
  });
});
