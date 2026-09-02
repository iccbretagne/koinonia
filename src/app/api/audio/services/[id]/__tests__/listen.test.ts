/**
 * Routes d'écoute internes (spec 021) — `audio:listen` exigé, isolation multi-tenant, cultes
 * dépubliés, dédoublonnage des tokens de partage, distinction playCount / openCount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createAdminSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/audio", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/audio")>();
  return {
    ...original,
    buildRenditionResponse: vi.fn(async () => new Response("stream", { status: 200 })),
    getOrCreatePrimaryShareToken: vi.fn(async () => ({ token: "existing-token" })),
    getOrCreateSegmentShareToken: vi.fn(async () => ({ token: "existing-segment-token" })),
  };
});

const { GET: streamGet } = await import("../stream/[segmentId]/route");
const { POST: playPost } = await import("../play/route");
const { POST: sharePost } = await import("../share/route");
const audioModule = await import("@/modules/audio");

const churchId = "church-1";
const otherChurchId = "church-2";
const serviceId = "service-1";
const segmentId = "segment-1";

function starSession(cId = churchId) {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId: cId,
        role: "STAR",
        ministryId: null,
        church: { id: cId, name: "Test Church", slug: "test-church" },
        departments: [],
      },
    ],
  });
}

function streamParams() {
  return { params: Promise.resolve({ id: serviceId, segmentId }) };
}
function idParams() {
  return { params: Promise.resolve({ id: serviceId }) };
}

function mockService(overrides: Record<string, unknown> = {}) {
  prismaMock.audioService.findUnique.mockResolvedValue({
    id: serviceId,
    churchId,
    status: "PUBLISHED",
    ...overrides,
  } as never);
}

function mockSegment(overrides: Record<string, unknown> = {}) {
  prismaMock.audioSegment.findUnique.mockResolvedValue({
    id: segmentId,
    serviceId,
    rendition: { s3Key: "segments/a.mp3" },
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(starSession());
  mockService();
  mockSegment();
  // requireAudioListenAccess (spec 036) retombe sur les partages entrants quand le rôle direct
  // manque — aucun partage par défaut ici, chaque test le renseigne s'il en a besoin.
  prismaMock.audioLibraryShare.findMany.mockResolvedValue([]);
});

describe("audio:listen exigé", () => {
  it("401 sans session sur GET stream", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await streamGet(new Request("http://localhost"), streamParams());
    expect(res.status).toBe(401);
  });

  it("401 sans session sur POST play", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      idParams()
    );
    expect(res.status).toBe(401);
  });

  it("401 sans session sur POST share", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await sharePost(new Request("http://localhost", { method: "POST", body: "{}" }), idParams());
    expect(res.status).toBe(401);
  });
});

describe("isolation multi-tenant — culte d'une autre église", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(createAdminSession(otherChurchId));
  });

  it("GET stream — 403", async () => {
    const res = await streamGet(new Request("http://localhost"), streamParams());
    expect(res.status).toBe(403);
  });

  it("POST play — 403", async () => {
    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      idParams()
    );
    expect(res.status).toBe(403);
    expect(prismaMock.audioSegment.update).not.toHaveBeenCalled();
  });

  it("POST share — 403", async () => {
    const res = await sharePost(new Request("http://localhost", { method: "POST", body: "{}" }), idParams());
    expect(res.status).toBe(403);
  });
});

describe("culte dépublié", () => {
  beforeEach(() => mockService({ status: "DRAFT" }));

  it("GET stream — 410", async () => {
    const res = await streamGet(new Request("http://localhost"), streamParams());
    expect(res.status).toBe(410);
  });

  it("POST play — 410", async () => {
    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      idParams()
    );
    expect(res.status).toBe(410);
  });

  it("POST share — 410", async () => {
    const res = await sharePost(new Request("http://localhost", { method: "POST", body: "{}" }), idParams());
    expect(res.status).toBe(410);
  });
});

describe("POST play — comptage", () => {
  it("incrémente playCount et jamais openCount", async () => {
    const res = await playPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      idParams()
    );

    expect(res.status).toBe(200);
    expect(prismaMock.audioSegment.update).toHaveBeenCalledWith({
      where: { id: segmentId },
      data: { playCount: { increment: 1 } },
    });
    expect(prismaMock.audioService.update).not.toHaveBeenCalled();
  });
});

describe("POST share — dédoublonnage", () => {
  it("réutilise un token existant pour le culte entier plutôt que d'en créer un second", async () => {
    const res = await sharePost(new Request("http://localhost", { method: "POST", body: "{}" }), idParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(audioModule.getOrCreatePrimaryShareToken).toHaveBeenCalledTimes(1);
    expect(audioModule.getOrCreateSegmentShareToken).not.toHaveBeenCalled();
    expect(body.url).toContain("existing-token");
  });

  it("réutilise un token existant pour une séquence donnée", async () => {
    const res = await sharePost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ segmentId }) }),
      idParams()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(audioModule.getOrCreateSegmentShareToken).toHaveBeenCalledTimes(1);
    expect(body.url).toContain("existing-segment-token");
  });
});
