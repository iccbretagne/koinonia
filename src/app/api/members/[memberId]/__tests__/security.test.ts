import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { PUT, DELETE } = await import("../route");

const makeParams = (memberId: string) => ({ params: Promise.resolve({ memberId }) });

describe("PUT /api/members/[memberId] — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("rejects update with cross-church departmentId", async () => {
    // Target department belongs to church-2
    prismaMock.department.findMany.mockResolvedValue([{
      id: "dept-other",
      ministry: { churchId: "church-2" },
    }]);

    const request = new Request("http://localhost/api/members/m-1", {
      method: "PUT",
      body: JSON.stringify({
        firstName: "Jean",
        lastName: "Dupont",
        departmentId: "dept-other",
      }),
    });
    const res = await PUT(request, makeParams("m-1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("même église");
  });

  it("allows update with same-church departmentId", async () => {
    prismaMock.department.findMany.mockResolvedValue([{
      id: "dept-1",
      ministry: { churchId: "church-1" },
    }]);
    prismaMock.member.update.mockResolvedValue({ id: "m-1" });
    prismaMock.memberDepartment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.memberDepartment.upsert.mockResolvedValue({});
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      firstName: "Jean",
      lastName: "Dupont",
      departments: [{ departmentId: "dept-1", isPrimary: true, department: { id: "dept-1", name: "Son", ministry: { id: "min-1", name: "Louange" } } }],
    });

    const request = new Request("http://localhost/api/members/m-1", {
      method: "PUT",
      body: JSON.stringify({
        firstName: "Jean",
        lastName: "Dupont",
        departmentId: "dept-1",
      }),
    });
    const res = await PUT(request, makeParams("m-1"));

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/members/[memberId] — cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("deletes member and all dependent records in transaction", async () => {
    prismaMock.member.findUnique.mockResolvedValue({
      id: "m-1",
      departments: [{ departmentId: "dept-1", isPrimary: true }],
    });
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.taskAssignment.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.discipleshipAttendance.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.memberUserLink.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.memberLinkRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.discipleship.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.member.delete.mockResolvedValue({ id: "m-1" });

    const request = new Request("http://localhost/api/members/m-1", { method: "DELETE" });
    const res = await DELETE(request, makeParams("m-1"));

    expect(res.status).toBe(200);
    // Verify all dependent deletions were called
    expect(prismaMock.planning.deleteMany).toHaveBeenCalledWith({ where: { memberId: "m-1" } });
    expect(prismaMock.taskAssignment.deleteMany).toHaveBeenCalledWith({ where: { memberId: "m-1" } });
    expect(prismaMock.discipleshipAttendance.deleteMany).toHaveBeenCalledWith({ where: { memberId: "m-1" } });
    expect(prismaMock.memberUserLink.deleteMany).toHaveBeenCalledWith({ where: { memberId: "m-1" } });
    expect(prismaMock.discipleship.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ discipleId: "m-1" }, { discipleMakerId: "m-1" }, { firstMakerId: "m-1" }] },
    });
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
  });
});
