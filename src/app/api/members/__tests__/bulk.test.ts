import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));

const { PATCH } = await import("../route");

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/members", { method: "PATCH", body: JSON.stringify(body) })
  );
}

function membersIn(...depts: string[][]) {
  prismaMock.member.findMany.mockResolvedValue(
    depts.map((ds, i) => ({ id: `m${i + 1}`, departments: ds.map((departmentId) => ({ departmentId })) }))
  );
}

describe("PATCH /api/members — actions en lot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
  });

  it("refuse des STAR de plusieurs églises", async () => {
    mockResolveChurchId.mockResolvedValueOnce("church-1").mockResolvedValueOnce("church-1").mockResolvedValueOnce("church-2");
    const res = await patch({ ids: ["m1", "m2"], action: "delete" });
    expect(res.status).toBe(400);
    expect(prismaMock.member.deleteMany).not.toHaveBeenCalled();
  });

  it("supprime en lot pour un admin, avec un audit par STAR", async () => {
    const res = await patch({ ids: ["m1", "m2"], action: "delete" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(prismaMock.member.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["m1", "m2"] } } });
    expect(prismaMock.memberLinkRequest.updateMany).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(2);
  });

  it("refuse à un responsable de supprimer un STAR partagé avec un autre département", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn(["dept-A"], ["dept-A", "dept-B"]);
    const res = await patch({ ids: ["m1", "m2"], action: "delete" });
    expect(res.status).toBe(403);
    expect(prismaMock.member.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse à un responsable de supprimer un STAR sans département", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn([]);
    const res = await patch({ ids: ["m1"], action: "delete" });
    expect(res.status).toBe(403);
  });

  it("laisse un responsable supprimer des STAR entièrement dans son périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn(["dept-A"]);
    const res = await patch({ ids: ["m1"], action: "delete" });
    expect(res.status).toBe(200);
  });

  it("refuse à un responsable de modifier un STAR sans département commun", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn(["dept-B"]);
    const res = await patch({ ids: ["m1"], action: "update", data: { lastName: "X" } });
    expect(res.status).toBe(403);
  });

  it("refuse à un responsable un département principal hors périmètre", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn(["dept-A", "dept-B"]);
    const res = await patch({ ids: ["m1"], action: "update", data: { primaryDepartmentId: "dept-B" } });
    expect(res.status).toBe(403);
  });

  it("refuse une mise à jour sans données", async () => {
    const res = await patch({ ids: ["m1"], action: "update", data: {} });
    expect(res.status).toBe(500);
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un département principal d'une autre église", async () => {
    prismaMock.department.findUnique.mockResolvedValue({ id: "dept-X", ministry: { churchId: "church-2" } });
    const res = await patch({ ids: ["m1"], action: "update", data: { primaryDepartmentId: "dept-X" } });
    expect(res.status).toBe(403);
    expect(prismaMock.memberDepartment.upsert).not.toHaveBeenCalled();
  });

  it("met à jour les champs et change le département principal de chaque STAR", async () => {
    mockRequireChurchPermission.mockResolvedValue(createDepartmentHeadSession([{ id: "dept-A", name: "A" }]));
    membersIn(["dept-A"], ["dept-A"]);
    prismaMock.department.findUnique.mockResolvedValue({ id: "dept-A", ministry: { churchId: "church-1" } });
    const res = await patch({
      ids: ["m1", "m2"],
      action: "update",
      data: { lastName: "Martin", primaryDepartmentId: "dept-A" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] } },
      data: { lastName: "Martin" },
    });
    expect(prismaMock.memberDepartment.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.memberDepartment.updateMany).toHaveBeenCalledWith({
      where: { memberId: "m2", isPrimary: true },
      data: { isPrimary: false },
    });
    expect(mockLogAudit).toHaveBeenCalledTimes(2);
  });

  it("change seulement le département principal sans toucher aux champs", async () => {
    prismaMock.department.findUnique.mockResolvedValue({ id: "dept-A", ministry: { churchId: "church-1" } });
    const res = await patch({ ids: ["m1"], action: "update", data: { primaryDepartmentId: "dept-A" } });
    expect(res.status).toBe(200);
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });
});
