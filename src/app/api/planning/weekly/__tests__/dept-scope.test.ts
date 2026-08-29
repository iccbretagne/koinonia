import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createStarSession } from "@/__mocks__/auth";
import { fakeRequireDepartmentAccess } from "@/lib/__tests__/support/dept-scope-mock";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  requireDepartmentAccess: (...args: Parameters<typeof fakeRequireDepartmentAccess>) =>
    fakeRequireDepartmentAccess(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");
const url = (deptId: string) =>
  `http://localhost?churchId=church-1&weekStart=2026-08-24&departmentId=${deptId}`;

describe("Périmètre de département — /api/planning/weekly (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.taskAssignment.findMany.mockResolvedValue([]);
  });

  it("DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const res = await GET(new Request(url("dept-A")));
    expect(res.status).toBe(403);
  });

  it("DEPARTMENT_HEAD dans son périmètre → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    const res = await GET(new Request(url("dept-A")));
    expect(res.status).toBe(200);
  });

  it("STAR → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(createStarSession());
    const res = await GET(new Request(url("dept-A")));
    expect(res.status).toBe(403);
  });

  it("ADMIN → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    const res = await GET(new Request(url("dept-A")));
    expect(res.status).toBe(200);
  });
});
