/**
 * T020 (spec 020) — GET /api/audio/services/[id] : `shareUrl` n'apparaît qu'une fois le culte
 * publié — avant, aucun lien n'existe (spec 020 § « récupérer le lien d'écoute »).
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

const { GET } = await import("../route");

const churchId = "church-1";
const serviceId = "service-1";

function params() {
  return { params: Promise.resolve({ id: serviceId }) };
}

describe("GET /api/audio/services/[id] — shareUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(createAdminSession(churchId));
  });

  it("shareUrl absent tant que le culte n'est pas publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "READY",
      sources: [],
      segments: [],
    } as never);

    const res = await GET(new Request("http://localhost"), params());
    const body = await res.json();

    expect(body.shareUrl).toBeNull();
    expect(prismaMock.audioShareToken.findFirst).not.toHaveBeenCalled();
  });

  it("shareUrl présent et correct une fois le culte publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "PUBLISHED",
      sources: [],
      segments: [],
    } as never);
    prismaMock.audioShareToken.findFirst.mockResolvedValue(null);
    prismaMock.audioShareToken.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "tok-1", ...data } as never)
    );

    const res = await GET(new Request("http://localhost"), params());
    const body = await res.json();

    expect(body.shareUrl).toMatch(/^\/ecouter\/[0-9a-f]{64}$/);
  });
});
