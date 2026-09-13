/**
 * Tests — DELETE /api/users/[userId] : retrait d'un compte pré-provisionné jamais activé (spec 047)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { DELETE } = await import("../route");

function setupTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
}

function makeRequest(userId: string, churchId: string) {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: "DELETE",
    body: JSON.stringify({ churchId }),
  });
}

describe("DELETE /api/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
  });

  it("refuse (409) si le compte a déjà terminé une connexion (accounts non vide)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@x.com",
      accounts: [{ id: "acc-1" }],
      churchRoles: [{ churchId: "church-1" }],
    } as never);

    const res = await DELETE(makeRequest("user-1", "church-1"), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(res.status).toBe(409);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("refuse (409) si l'utilisateur a un rôle dans une autre église", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@x.com",
      accounts: [],
      churchRoles: [{ churchId: "autre-eglise" }],
    } as never);

    const res = await DELETE(makeRequest("user-1", "church-1"), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(res.status).toBe(409);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("supprime le compte jamais connecté, sans rôle ailleurs (200)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@x.com",
      accounts: [],
      churchRoles: [{ churchId: "church-1" }],
    } as never);
    prismaMock.userDepartment.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.userChurchRole.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.memberUserLink.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.user.delete.mockResolvedValue({} as never);
    setupTransaction();

    const res = await DELETE(makeRequest("user-1", "church-1"), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("retourne 404 si l'utilisateur est introuvable", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await DELETE(makeRequest("user-inconnu", "church-1"), {
      params: Promise.resolve({ userId: "user-inconnu" }),
    });

    expect(res.status).toBe(404);
  });

  it("retourne 403 sans permission members:manage", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await DELETE(makeRequest("user-1", "church-1"), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(res.status).toBe(403);
  });
});
