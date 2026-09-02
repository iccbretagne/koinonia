/**
 * T044 — Isolation multi-tenant (constitution règle II) : un utilisateur d'une autre église
 * n'atteint aucune route `audio` de l'église visée.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: { windowMs: 60_000, max: 30 },
}));

vi.mock("@/modules/audio", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/audio")>();
  return {
    ...original,
    buildRenditionResponse: vi.fn(async () => new Response("stream", { status: 200 })),
  };
});

const { GET: serviceGet } = await import("../[id]/route");
const { PUT: sequencesPut } = await import("../[id]/sequences/route");
const { POST: publishPost } = await import("../[id]/publish/route");
const { POST: signPost } = await import("../[id]/upload/sign/route");
const { POST: unpublishPost } = await import("../[id]/unpublish/route");
const { POST: sharePost } = await import("../[id]/share/route");
const { POST: playPost } = await import("../[id]/play/route");
const { GET: streamGet } = await import("../[id]/stream/[segmentId]/route");

const targetChurchId = "church-target";
const otherChurchId = "church-attacker";
const serviceId = "service-of-target-church";

function params() {
  return { params: Promise.resolve({ id: serviceId }) };
}

describe("Isolation multi-tenant — routes audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(otherChurchId));
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId: targetChurchId,
      status: "DRAFT",
      sources: [],
      segments: [],
    } as never);
  });

  it("GET /api/audio/services/[id] — 403 pour un admin d'une autre église", async () => {
    const res = await serviceGet(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
  });

  it("PUT .../sequences — 403 pour un admin d'une autre église", async () => {
    const res = await sequencesPut(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ sequences: [{ sourceId: "s1", order: 0, title: "Louange" }] }),
      }),
      params()
    );
    expect(res.status).toBe(403);
  });

  it("POST .../publish — 403 pour un admin d'une autre église", async () => {
    const res = await publishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(res.status).toBe(403);
    expect(prismaMock.audioJob.createMany).not.toHaveBeenCalled();
  });

  it("POST .../upload/sign — 403 pour un admin d'une autre église", async () => {
    const res = await signPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ kind: "SEQUENCE", filename: "f.mp3", contentType: "audio/mpeg", size: 1000 }),
      }),
      params()
    );
    expect(res.status).toBe(403);
  });

  it("un SUPER_ADMIN, lui, n'est pas bloqué par la frontière de tenant", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "super@example.com",
        name: "Super Admin",
        displayName: null,
        image: null,
        isSuperAdmin: true,
        hasSeenTour: false,
        pastoralProfileId: null,
        pastoralChurchIds: [],
        churchRoles: [],
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const res = await serviceGet(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
  });
});

// Spec 036 — un partage de bibliothèque n'élargit QUE l'écoute (play/stream), jamais
// l'administration du culte de l'église propriétaire.
describe("Isolation multi-tenant — bibliothèque partagée (spec 036)", () => {
  const segmentId = "segment-1";

  function streamParams() {
    return { params: Promise.resolve({ id: serviceId, segmentId }) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(otherChurchId));
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId: targetChurchId,
      status: "PUBLISHED",
      sources: [],
      segments: [],
    } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({
      id: segmentId,
      serviceId,
      rendition: { s3Key: "segments/a.mp3" },
    } as never);
    // targetChurchId a ouvert sa bibliothèque à otherChurchId.
    prismaMock.audioLibraryShare.findMany.mockResolvedValue([
      {
        id: "share-1",
        ownerChurchId: targetChurchId,
        guestChurchId: otherChurchId,
        createdAt: new Date("2026-09-02"),
        guestChurch: { id: otherChurchId, name: "Église attaquante", slug: "eglise-attaquante" },
      },
    ] as never);
  });

  it("POST .../play — 200 : l'écoute passe par le partage", async () => {
    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      params()
    );
    expect(res.status).toBe(200);
  });

  it("GET .../stream — 200 : la diffusion passe par le partage", async () => {
    const res = await streamGet(new Request("http://localhost"), streamParams());
    expect(res.status).toBe(200);
  });

  it("POST .../share — 403 : pas de lien public sur le contenu d'autrui", async () => {
    const res = await sharePost(new Request("http://localhost", { method: "POST", body: "{}" }), params());
    expect(res.status).toBe(403);
  });

  it("POST .../publish — 403 : aucune écriture dans l'église propriétaire", async () => {
    const res = await publishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(res.status).toBe(403);
  });

  it("POST .../unpublish — 403 : aucune écriture dans l'église propriétaire", async () => {
    const res = await unpublishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(res.status).toBe(403);
  });

  it("PUT .../sequences — 403 : aucune écriture dans l'église propriétaire", async () => {
    const res = await sequencesPut(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ sequences: [{ sourceId: "s1", order: 0, title: "Louange" }] }),
      }),
      params()
    );
    expect(res.status).toBe(403);
  });

  it("POST .../upload/sign — 403 : aucun dépôt dans l'église propriétaire", async () => {
    const res = await signPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ kind: "SEQUENCE", filename: "f.mp3", contentType: "audio/mpeg", size: 1000 }),
      }),
      params()
    );
    expect(res.status).toBe(403);
  });

  it("POST .../play — 410 sur un culte non publié du propriétaire, partage actif ou non", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId: targetChurchId,
      status: "DRAFT",
    } as never);

    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      params()
    );
    expect(res.status).toBe(410);
  });
});
