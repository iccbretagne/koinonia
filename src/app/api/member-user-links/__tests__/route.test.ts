/**
 * Tests — HIGH-1 : Vérification inter-tenant dans le linking membre-utilisateur
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST } = await import("../route");

const baseMember = {
  id: "member-1",
  firstName: "Jean",
  lastName: "Dupont",
};

describe("POST /api/member-user-links — isolation inter-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("refuse de lier un utilisateur qui n'a aucun lien avec l'église", async () => {
    prismaMock.member.findFirst.mockResolvedValue(baseMember as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-outsider", email: "x@x.com" } as never);

    // L'utilisateur n'est pas dans l'église (ni churchRole ni memberLinkRequest)
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.memberLinkRequest.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({
        memberId: "member-1",
        userId: "user-outsider",
        churchId: "church-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("lien");
  });

  it("autorise le lien si l'utilisateur a un rôle dans l'église", async () => {
    prismaMock.member.findFirst.mockResolvedValue(baseMember as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-in-church", email: "u@example.com" } as never);

    // L'utilisateur a un rôle dans l'église
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "ucr-1" } as never);

    // Pas de doublon
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.memberUserLink.create.mockResolvedValue({
      id: "link-1",
      memberId: "member-1",
      userId: "user-in-church",
      churchId: "church-1",
      validatedAt: new Date(),
      validatedById: "user-1",
    } as never);
    prismaMock.user.update.mockResolvedValue({ id: "user-in-church" } as never);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({
        memberId: "member-1",
        userId: "user-in-church",
        churchId: "church-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(201);
  });

  it("autorise le lien si l'utilisateur a une memberLinkRequest dans l'église", async () => {
    prismaMock.member.findFirst.mockResolvedValue(baseMember as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-with-request", email: "r@example.com" } as never);

    // Pas de rôle mais une memberLinkRequest
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.memberLinkRequest.findFirst.mockResolvedValue({ id: "mlr-1" } as never);

    // Pas de doublon
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.memberUserLink.create.mockResolvedValue({
      id: "link-2",
      memberId: "member-1",
      userId: "user-with-request",
      churchId: "church-1",
      validatedAt: new Date(),
      validatedById: "user-1",
    } as never);
    prismaMock.user.update.mockResolvedValue({ id: "user-with-request" } as never);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({
        memberId: "member-1",
        userId: "user-with-request",
        churchId: "church-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(201);
  });

  it("retourne 404 si le STAR n'appartient pas à l'église", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/member-user-links", {
      method: "POST",
      body: JSON.stringify({
        memberId: "member-other-church",
        userId: "user-1",
        churchId: "church-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(404);
  });
});
