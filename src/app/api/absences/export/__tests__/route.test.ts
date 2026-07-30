import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockGetUserDepartmentScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
}));

vi.mock("@/modules/planning", () => ({
  findAbsenceConflicts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../route");

const absenceRow = {
  id: "abs-1",
  churchId: "church-1",
  memberId: "member-1",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2026-09-05"),
  reason: null,
  status: "ACTIVE",
  createdById: "user-1",
  member: {
    firstName: "Jean",
    lastName: "Dupont",
    departments: [{ department: { name: "Choristes", ministry: { name: "Louange" } } }],
  },
  createdBy: { name: "Jean Dupont", displayName: null },
  backups: [],
};

describe("POST /api/absences/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    prismaMock.absence.findMany.mockResolvedValue([absenceRow] as never);
  });

  it("returns 403 without absences:view", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await POST(
      new Request("http://localhost/api/absences/export", {
        method: "POST",
        body: JSON.stringify({ churchId: "church-1", absenceIds: ["abs-1"] }),
      })
    );

    expect(res.status).toBe(403);
  });

  it("returns 400 with an invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/absences/export", { method: "POST", body: JSON.stringify({}) })
    );

    expect(res.status).toBe(400);
  });

  it("generates an xlsx file for an unscoped (global) manager", async () => {
    const res = await POST(
      new Request("http://localhost/api/absences/export", {
        method: "POST",
        body: JSON.stringify({ churchId: "church-1", absenceIds: ["abs-1"] }),
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(prismaMock.absence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["abs-1"] }, churchId: "church-1" }) })
    );
  });

  it("restricts the query to the caller's department scope", async () => {
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-1"] });
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ memberId: "member-1" }] as never);

    const res = await POST(
      new Request("http://localhost/api/absences/export", {
        method: "POST",
        body: JSON.stringify({ churchId: "church-1", absenceIds: ["abs-1", "abs-outside-scope"] }),
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.absence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: { in: ["member-1"] } }),
      })
    );
  });

  it("returns an empty workbook (no rows) when the scope excludes all departments", async () => {
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: [] });
    prismaMock.absence.findMany.mockResolvedValue([] as never);

    const res = await POST(
      new Request("http://localhost/api/absences/export", {
        method: "POST",
        body: JSON.stringify({ churchId: "church-1", absenceIds: ["abs-1"] }),
      })
    );

    expect(res.status).toBe(200);
    expect(prismaMock.absence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberId: { in: [] } }) })
    );
  });
});
