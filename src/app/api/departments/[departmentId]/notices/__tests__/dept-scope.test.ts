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

const { GET, PUT, DELETE } = await import("../route");
const makeParams = (departmentId: string) => Promise.resolve({ departmentId });

describe("Périmètre de département — /api/departments/[departmentId]/notices (spec 031)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.departmentNotice.findUnique.mockResolvedValue(null);
  });

  it("GET : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const res = await GET(new Request("http://localhost?eventId=evt-1"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : DEPARTMENT_HEAD dans son périmètre → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "A" }])
    );
    const res = await GET(new Request("http://localhost?eventId=evt-1"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("GET : STAR → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(createStarSession());
    const res = await GET(new Request("http://localhost?eventId=evt-1"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : ADMIN → 200", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    const res = await GET(new Request("http://localhost?eventId=evt-1"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("PUT : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ eventId: "evt-1", content: "consigne" }),
    });
    const res = await PUT(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("DELETE : DEPARTMENT_HEAD hors périmètre → 403", async () => {
    mockRequireChurchPermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-B", name: "B" }])
    );
    const res = await DELETE(new Request("http://localhost?eventId=evt-1", { method: "DELETE" }), {
      params: makeParams("dept-A"),
    });
    expect(res.status).toBe(403);
  });
});
