/**
 * Tests — P2 : auto-liaison self-service par email (POST /api/member-user-links/self)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequireAuth = vi.fn();
const mockRequireRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST } = await import("../route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/member-user-links/self", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/member-user-links/self", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: "user-1", email: "alice@example.com" } });
    mockRequireRateLimit.mockReturnValue(undefined);
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
    );
  });

  it("crée le lien + le rôle STAR quand l'email correspond (succès)", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", email: "Alice@Example.com" } as never);
    // assertSelfLinkAllowed : fiche dans l'église + pas de lien existant
    prismaMock.memberDepartment.findFirst.mockResolvedValue({ id: "md1" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    // transaction
    prismaMock.memberUserLink.create.mockResolvedValue({ id: "link-1" } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({ id: "ucr-1" } as never);

    const res = await POST(makeRequest({ memberId: "m1", churchId: "c1" }));

    expect(res.status).toBe(201);
    expect(prismaMock.memberUserLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: "m1", userId: "user-1", churchId: "c1" }),
      })
    );
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "STAR" }) })
    );
  });

  it("n'attribue pas STAR si l'utilisateur a déjà un rôle dans l'église", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", email: "alice@example.com" } as never);
    prismaMock.memberDepartment.findFirst.mockResolvedValue({ id: "md1" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberUserLink.create.mockResolvedValue({ id: "link-1" } as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "existing-role" } as never);

    const res = await POST(makeRequest({ memberId: "m1", churchId: "c1" }));

    expect(res.status).toBe(201);
    expect(prismaMock.userChurchRole.create).not.toHaveBeenCalled();
  });

  it("refuse (403) si l'email du compte diffère de celui de la fiche", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", email: "bob@example.com" } as never);

    const res = await POST(makeRequest({ memberId: "m1", churchId: "c1" }));

    expect(res.status).toBe(403);
    expect(prismaMock.memberUserLink.create).not.toHaveBeenCalled();
  });

  it("refuse (403) si la fiche est déjà liée dans cette église", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", email: "alice@example.com" } as never);
    prismaMock.memberDepartment.findFirst.mockResolvedValue({ id: "md1" } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ id: "existing-link" } as never);

    const res = await POST(makeRequest({ memberId: "m1", churchId: "c1" }));

    expect(res.status).toBe(403);
    expect(prismaMock.memberUserLink.create).not.toHaveBeenCalled();
  });

  it("refuse (403) si la fiche n'appartient pas à l'église visée", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m1", email: "alice@example.com" } as never);
    prismaMock.memberDepartment.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ memberId: "m1", churchId: "c1" }));

    expect(res.status).toBe(403);
    expect(prismaMock.memberUserLink.create).not.toHaveBeenCalled();
  });

  it("retourne 404 si la fiche est introuvable", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ memberId: "unknown", churchId: "c1" }));

    expect(res.status).toBe(404);
  });
});
