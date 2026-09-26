/**
 * Tests — POST /api/admin/members/assign-star-roles (spec 054/#583, défaut B2).
 * `access:manage` remplace `members:manage` ; les liens hors périmètre de l'appelant restreint
 * (Ministre) ne sont plus assignés.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../route");

function request() {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ churchId: "church-1" }),
  });
}

function ministerSession(departmentIds: string[]) {
  return {
    user: {
      id: "min-1",
      isSuperAdmin: false,
      churchRoles: [
        {
          churchId: "church-1",
          role: "MINISTER",
          ministryId: "ministry-1",
          departments: departmentIds.map((id) => ({ department: { id } })),
        },
      ],
    },
  };
}

describe("POST /api/admin/members/assign-star-roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
  });

  it("Admin (non restreint) : assigne le rôle à tous les comptes liés sans rôle", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { userId: "u1", member: { departments: [{ departmentId: "dept-a" }] } },
      { userId: "u2", member: { departments: [{ departmentId: "dept-b" }] } },
    ] as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.assigned).toBe(2);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledTimes(2);
  });

  it("Ministre restreint : n'assigne que les liens dont la fiche est dans son périmètre (B2)", async () => {
    mockRequireChurchPermission.mockResolvedValue(ministerSession([]));
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-a" }] as never); // départements du ministère
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { userId: "u1", member: { departments: [{ departmentId: "dept-a" }] } }, // dans le périmètre
      { userId: "u2", member: { departments: [{ departmentId: "dept-hors-perimetre" }] } }, // hors périmètre
    ] as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.assigned).toBe(1);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith({
      data: { userId: "u1", churchId: "church-1", role: "STAR" },
    });
  });
});
