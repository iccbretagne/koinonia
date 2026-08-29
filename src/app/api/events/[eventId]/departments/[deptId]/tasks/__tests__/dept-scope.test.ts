import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession, createStarSession } from "@/__mocks__/auth";
import { fakeRequireDepartmentAccess } from "@/lib/__tests__/support/dept-scope-mock";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
  requireDepartmentAccess: (...args: Parameters<typeof fakeRequireDepartmentAccess>) =>
    fakeRequireDepartmentAccess(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, PUT } = await import("../route");
const makeParams = (eventId: string, deptId: string) => Promise.resolve({ eventId, deptId });

describe("Périmètre de département — /api/events/[eventId]/departments/[deptId]/tasks (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.findUnique.mockResolvedValue({ id: "task-1", departmentId: "dept-A" } as never);
    prismaMock.planning.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("GET : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const res = await GET(new Request("http://localhost"), { params: makeParams("evt-1", "dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : DEPARTMENT_HEAD dans son périmètre → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    const res = await GET(new Request("http://localhost"), { params: makeParams("evt-1", "dept-A") });
    expect(res.status).toBe(200);
  });

  it("GET : STAR → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(createStarSession());
    const res = await GET(new Request("http://localhost"), { params: makeParams("evt-1", "dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : ADMIN → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    const res = await GET(new Request("http://localhost"), { params: makeParams("evt-1", "dept-A") });
    expect(res.status).toBe(200);
  });

  it("PUT : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ taskId: "task-1", memberIds: [] }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-A") });
    expect(res.status).toBe(403);
  });
});
