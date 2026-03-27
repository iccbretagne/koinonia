import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockRequirePermission = vi.fn();
const mockRequireRateLimit = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: (...args: unknown[]) => mockRequireRateLimit(...args),
  RATE_LIMIT_SENSITIVE: { windowMs: 60000, max: 10 },
}));

const { POST } = await import("../route");

describe("POST /api/users/[userId]/roles — scope validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockRequireRateLimit.mockReturnValue(undefined);
  });

  it("returns 400 when MINISTER role has no ministryId", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "MINISTER" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("ministère");
  });

  it("returns 400 when DEPARTMENT_HEAD role has no departments", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "DEPARTMENT_HEAD" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("département");
  });

  it("returns 400 when department belongs to another church", async () => {
    prismaMock.ministry.findUnique.mockResolvedValue(null);
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1", name: "Choristes", ministry: { id: "min-1", churchId: "church-OTHER" } },
    ] as never);

    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({
        churchId: "church-1",
        role: "DEPARTMENT_HEAD",
        departmentIds: ["dept-1"],
      }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("église");
  });

  it("returns 403 when non-super-admin tries to assign ADMIN role", async () => {
    const request = new Request("http://localhost/api/users/user-1/roles", {
      method: "POST",
      body: JSON.stringify({ churchId: "church-1", role: "ADMIN" }),
    });

    const res = await POST(request, { params: Promise.resolve({ userId: "user-1" }) });

    expect(res.status).toBe(403);
  });
});
