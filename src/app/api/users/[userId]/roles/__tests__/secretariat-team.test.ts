// Spec 045 (T5/T15) — un membre de l'équipe Secrétariat n'a, sur cette route, jamais plus de
// pouvoir qu'un porteur du rôle Secrétaire réel : il ne peut pas attribuer de rôle privilégié
// (anti-escalade `PRIVILEGED_ROLES` → `isSuperAdmin`, inchangée), et une tentative de cibler
// l'entrée synthétique (id `virtual-secretariat-*`, jamais persistée) échoue proprement, sans
// crash ni contrainte Prisma silencieuse.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSecretariatTeamSession, createSecretarySession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequirePermission = vi.fn();
const mockRequireRateLimit = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  getUserMinistryScope: () => ({ scoped: false }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST, PATCH, DELETE } = await import("../route");

describe("POST /api/users/[userId]/roles — anti-escalade équipe Secrétariat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it.each(["SUPER_ADMIN", "ADMIN", "SECRETARY"])(
    "refuse l'attribution du rôle privilégié %s par un membre de l'équipe (non Super Admin)",
    async (role) => {
      mockRequirePermission.mockResolvedValue(createSecretariatTeamSession("church-1"));

      const request = new Request("http://localhost/api/users/user-2/roles", {
        method: "POST",
        body: JSON.stringify({ churchId: "church-1", role }),
      });
      const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });

      expect(res.status).toBe(403);
    }
  );

  it("un Secrétaire réel est refusé de la même façon (même verdict, pas de faveur)", async () => {
    mockRequirePermission.mockResolvedValue(createSecretarySession("church-1"));

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });

    expect(res.status).toBe(403);
  });

  it("autorise l'attribution d'un rôle non privilégié (STAR) par un membre de l'équipe", async () => {
    mockRequirePermission.mockResolvedValue(createSecretariatTeamSession("church-1"));
    prismaMock.userChurchRole.create.mockResolvedValue({
      id: "new-role",
      churchId: "church-1",
      role: "STAR",
      ministryId: null,
      church: { id: "church-1", name: "Église", slug: "eglise" },
      ministry: null,
      departments: [],
    });

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "STAR" }),
    });
    const res = await POST(request, { params: Promise.resolve({ userId: "user-2" }) });

    expect(res.status).toBe(201);
  });
});

describe("PATCH/DELETE /api/users/[userId]/roles — id/entrée synthétique introuvable en base (T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("PATCH sur l'id virtuel répond 'introuvable', sans exception non gérée", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "PATCH",
      body: JSON.stringify({ roleId: "virtual-secretariat-church-1" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ userId: "user-2" }) });

    expect(res.status).toBe(404);
  });

  it("DELETE ciblant SECRETARY quand seule l'entrée virtuelle existe ne supprime rien en base et échoue proprement", async () => {
    mockRequirePermission.mockResolvedValue(createSecretariatTeamSession("church-1"));
    prismaMock.userChurchRole.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/users/user-2/roles", {
      method: "DELETE",
      body: JSON.stringify({ churchId: "church-1", role: "SECRETARY" }),
    });
    const res = await DELETE(request, { params: Promise.resolve({ userId: "user-2" }) });

    expect(res.status).not.toBe(200);
    expect(prismaMock.userChurchRole.delete).not.toHaveBeenCalled();
  });
});
