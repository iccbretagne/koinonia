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

const { GET, POST, DELETE } = await import("../route");
const makeParams = (departmentId: string) => Promise.resolve({ departmentId });

describe("Périmètre de département — /api/departments/[departmentId]/tasks (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.department.findUnique.mockResolvedValue({ id: "dept-A", name: "A" } as never);
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.findUnique.mockResolvedValue(null);
    prismaMock.task.create.mockResolvedValue({ id: "task-1", departmentId: "dept-A", name: "x" } as never);
  });

  it("GET : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : DEPARTMENT_HEAD dans son périmètre → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("GET : STAR → 403 (restriction totale)", async () => {
    mockRequireChurchPermission.mockResolvedValue(createStarSession());
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : ADMIN → 200, n'importe quel département", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("POST : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "Nouvelle tâche" }),
    });
    const res = await POST(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("DELETE : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const request = new Request("http://localhost", {
      method: "DELETE",
      body: JSON.stringify({ taskId: "task-1" }),
    });
    const res = await DELETE(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });
});
