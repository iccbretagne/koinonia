/**
 * Tests — POST /api/admin/members/merge (spec 054/#583, défaut B1).
 * Un appelant restreint (Ministre) ne peut fusionner que si les DEUX fiches sont entièrement
 * dans son périmètre — plus strict que la modification d'une fiche, qui autorise un seul
 * département commun.
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
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { POST } = await import("../route");

function memberWithPrimaryChurch(churchId: string) {
  return {
    departments: [{ isPrimary: true, department: { ministry: { churchId } } }],
  };
}

function ministerSession(ministryId = "ministry-1") {
  return {
    user: {
      id: "min-1",
      isSuperAdmin: false,
      churchRoles: [
        { churchId: "church-1", role: "MINISTER", ministryId, departments: [] },
      ],
    },
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({
      sourceId: "member-src",
      targetId: "member-tgt",
      resolution: { firstName: "Jean", lastName: "Dupont" },
      ...overrides,
    }),
  });
}

function setupTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
}

describe("POST /api/admin/members/merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.member.findUnique.mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === "member-src"
        ? memberWithPrimaryChurch("church-1")
        : memberWithPrimaryChurch("church-1")) as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.planning.findMany.mockResolvedValue([]);
    prismaMock.taskAssignment.findMany.mockResolvedValue([]);
    prismaMock.discipleshipAttendance.findMany.mockResolvedValue([]);
    prismaMock.discipleship.findMany.mockResolvedValue([]);
    prismaMock.discipleship.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.memberLinkRequest.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    prismaMock.member.update.mockResolvedValue({} as never);
    prismaMock.member.delete.mockResolvedValue({} as never);
  });

  it("Admin (non restreint) : fusionne sans vérification de périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    setupTransaction();

    const res = await POST(body());

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("Ministre restreint : refuse (403) si une des deux fiches déborde de son périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(ministerSession());
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-a" }] as never); // départements du ministère
    // La fiche source a un département hors périmètre (dept-hors)
    prismaMock.memberDepartment.findMany.mockImplementation((async (args: { where: { memberId: string } }) =>
      args.where.memberId === "member-src"
        ? [{ departmentId: "dept-hors" }]
        : [{ departmentId: "dept-a" }]) as never);

    const res = await POST(body());

    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("Ministre restreint : fusionne quand les deux fiches sont entièrement dans son périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(ministerSession());
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-a" }] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-a" }] as never);
    setupTransaction();

    const res = await POST(body());

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("retourne 400 si source et cible sont identiques", async () => {
    const res = await POST(body({ sourceId: "member-1", targetId: "member-1" }));
    expect(res.status).toBe(400);
  });

  it("retourne 404 si le membre source est introuvable", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    const res = await POST(body());
    expect(res.status).toBe(404);
  });
});
