import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

// Mock auth + audit before importing the route handlers
const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { PUT, DELETE } = await import("../[memberId]/route");

function putRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/members/member-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// department.findMany renvoie les départements validés (tous dans church-1)
function mockDeptValidation(ids: string[]) {
  prismaMock.department.findMany.mockResolvedValue(
    ids.map((id) => ({ id, ministry: { churchId: "church-1" } }))
  );
}

describe("PUT /api/members/[memberId] — périmètre multi-départements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.member.update.mockResolvedValue({});
    prismaMock.memberDepartment.upsert.mockResolvedValue({});
    prismaMock.memberDepartment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.taskAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.member.findUnique.mockResolvedValue({ id: "member-1", departments: [] });
  });

  it("laisse un responsable gérer un STAR dont le département principal est hors de son périmètre", async () => {
    // Responsable du dept-A ; le STAR a pour principal dept-B (hors scope) + dept-A (dans scope)
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    prismaMock.member.findUnique
      .mockResolvedValueOnce({
        id: "member-1",
        departments: [
          { departmentId: "dept-B", isPrimary: true },
          { departmentId: "dept-A", isPrimary: false },
        ],
      })
      .mockResolvedValueOnce({ id: "member-1", departments: [] });
    mockDeptValidation(["dept-A"]);

    const res = await PUT(putRequest({ firstName: "Jean", lastName: "Dupont", departmentId: "dept-A" }), {
      params: Promise.resolve({ memberId: "member-1" }),
    });

    expect(res.status).toBe(200);
    // Le principal hors scope (dept-B) est préservé comme principal
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId_departmentId: { memberId: "member-1", departmentId: "dept-B" } },
        update: { isPrimary: true },
      })
    );
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId_departmentId: { memberId: "member-1", departmentId: "dept-A" } },
        update: { isPrimary: false },
      })
    );
    // Rien n'est retiré
    expect(prismaMock.memberDepartment.deleteMany).not.toHaveBeenCalled();
  });

  it("désaffecte le STAR d'un département géré sans toucher aux affiliations hors périmètre", async () => {
    // Responsable de dept-A et dept-C ; STAR dans dept-A (principal), dept-C (géré) et dept-B (hors scope)
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([
        { id: "dept-A", name: "A" },
        { id: "dept-C", name: "C" },
      ])
    );
    prismaMock.member.findUnique
      .mockResolvedValueOnce({
        id: "member-1",
        departments: [
          { departmentId: "dept-A", isPrimary: true },
          { departmentId: "dept-C", isPrimary: false },
          { departmentId: "dept-B", isPrimary: false },
        ],
      })
      .mockResolvedValueOnce({ id: "member-1", departments: [] });
    mockDeptValidation(["dept-A"]);

    // L'utilisateur retire dept-C (ne soumet que dept-A)
    const res = await PUT(putRequest({ firstName: "Jean", lastName: "Dupont", departmentId: "dept-A" }), {
      params: Promise.resolve({ memberId: "member-1" }),
    });

    expect(res.status).toBe(200);
    // Seul dept-C est retiré ; dept-B (hors périmètre) est préservé
    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "member-1", departmentId: { in: ["dept-C"] } },
    });
  });

  it("reconstruit toutes les affiliations pour un admin (accès global)", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    prismaMock.member.findUnique
      .mockResolvedValueOnce({
        id: "member-1",
        departments: [
          { departmentId: "dept-1", isPrimary: true },
          { departmentId: "dept-2", isPrimary: false },
        ],
      })
      .mockResolvedValueOnce({ id: "member-1", departments: [] });
    mockDeptValidation(["dept-2", "dept-3"]);

    const res = await PUT(
      putRequest({ firstName: "Jean", lastName: "Dupont", departmentId: "dept-2", additionalDepartmentIds: ["dept-3"] }),
      { params: Promise.resolve({ memberId: "member-1" }) }
    );

    expect(res.status).toBe(200);
    // dept-1 (non soumis) est retiré ; dept-2 devient principal
    expect(prismaMock.memberDepartment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "member-1", departmentId: { in: ["dept-1"] } },
    });
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId_departmentId: { memberId: "member-1", departmentId: "dept-2" } },
        update: { isPrimary: true },
      })
    );
  });
});

describe("DELETE /api/members/[memberId] — périmètre multi-départements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
  });

  it("refuse la suppression d'un STAR partagé avec un département hors périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [{ departmentId: "dept-A" }, { departmentId: "dept-B" }],
    });

    const res = await DELETE(new Request("http://localhost/api/members/member-1", { method: "DELETE" }), {
      params: Promise.resolve({ memberId: "member-1" }),
    });

    expect(res.status).toBe(403);
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });

  it("autorise la suppression d'un STAR entièrement dans le périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    prismaMock.member.findUnique.mockResolvedValue({
      id: "member-1",
      departments: [{ departmentId: "dept-A" }],
    });
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.taskAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.discipleshipAttendance.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.memberUserLink.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.memberLinkRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.discipleship.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.member.delete.mockResolvedValue({ id: "member-1" });

    const res = await DELETE(new Request("http://localhost/api/members/member-1", { method: "DELETE" }), {
      params: Promise.resolve({ memberId: "member-1" }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: "member-1" } });
  });
});
