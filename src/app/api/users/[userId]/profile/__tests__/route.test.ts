/**
 * Tests — PATCH /api/users/[userId]/profile (spec 054/#583, D2).
 *
 * Remplace un contrôle de rôle codé en dur (SUPER_ADMIN/ADMIN/SECRETARY) par `users:manage`
 * via `rolePermissions` — la Secrétaire perd donc ce geste, l'Admin le garde.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/registry", () => ({
  rolePermissions: {
    SUPER_ADMIN: ["users:manage"],
    ADMIN: ["users:manage"],
    SECRETARY: [],
    MINISTER: [],
    DEPARTMENT_HEAD: [],
  },
}));

const { PATCH } = await import("../route");
const makeParams = (userId: string) => Promise.resolve({ userId });

function request(displayName = "Marie Dupont") {
  return new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
}

describe("PATCH /api/users/[userId]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({ id: "target-1", displayName: "Marie Dupont" } as never);
  });

  it("permet à l'utilisateur de modifier son propre profil, sans permission particulière", async () => {
    mockRequireAuth.mockResolvedValue(createSession({ id: "target-1", churchRoles: [] }));

    const res = await PATCH(request(), { params: makeParams("target-1") });

    expect(res.status).toBe(200);
  });

  it("permet à l'Admin de modifier le profil d'un utilisateur d'une église commune", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "admin-1",
        churchRoles: [
          {
            id: "r1", churchId: "church-1", role: "ADMIN", ministryId: null,
            church: { id: "church-1", name: "X", slug: "x" }, departments: [],
          },
        ],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue({
      churchRoles: [{ churchId: "church-1" }],
    } as never);

    const res = await PATCH(request(), { params: makeParams("target-1") });

    expect(res.status).toBe(200);
  });

  it("refuse (403) à la Secrétaire — n'a plus users:manage (D2)", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "sec-1",
        churchRoles: [
          {
            id: "r1", churchId: "church-1", role: "SECRETARY", ministryId: null,
            church: { id: "church-1", name: "X", slug: "x" }, departments: [],
          },
        ],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue({
      churchRoles: [{ churchId: "church-1" }],
    } as never);

    const res = await PATCH(request(), { params: makeParams("target-1") });

    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuse (403) à un Ministre/Resp. département — n'a jamais eu users:manage", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "min-1",
        churchRoles: [
          {
            id: "r1", churchId: "church-1", role: "MINISTER", ministryId: null,
            church: { id: "church-1", name: "X", slug: "x" }, departments: [],
          },
        ],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue({
      churchRoles: [{ churchId: "church-1" }],
    } as never);

    const res = await PATCH(request(), { params: makeParams("target-1") });

    expect(res.status).toBe(403);
  });

  it("refuse (403) si l'Admin et la cible ne partagent aucune église", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "admin-1",
        churchRoles: [
          {
            id: "r1", churchId: "church-1", role: "ADMIN", ministryId: null,
            church: { id: "church-1", name: "X", slug: "x" }, departments: [],
          },
        ],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue({
      churchRoles: [{ churchId: "autre-eglise" }],
    } as never);

    const res = await PATCH(request(), { params: makeParams("target-1") });

    expect(res.status).toBe(403);
  });

  it("retourne 404 si l'utilisateur cible n'existe pas", async () => {
    mockRequireAuth.mockResolvedValue(
      createSession({
        id: "admin-1",
        churchRoles: [
          {
            id: "r1", churchId: "church-1", role: "ADMIN", ministryId: null,
            church: { id: "church-1", name: "X", slug: "x" }, departments: [],
          },
        ],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await PATCH(request(), { params: makeParams("inconnu") });

    expect(res.status).toBe(404);
  });
});
