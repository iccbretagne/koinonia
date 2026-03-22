import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { PATCH } = await import("../../departments/route");

describe("PATCH /api/departments (bulk) — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("rejects bulk update when IDs span multiple churches", async () => {
    mockResolveChurchId
      .mockResolvedValueOnce("church-1")
      .mockResolvedValueOnce("church-1")
      .mockResolvedValueOnce("church-2");

    const request = new Request("http://localhost/api/departments", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["dept-1", "dept-2"], action: "update", data: { name: "X" } }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("même église");
  });

  it("rejects update with cross-church ministryId destination", async () => {
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-2" });

    const request = new Request("http://localhost/api/departments", {
      method: "PATCH",
      body: JSON.stringify({
        ids: ["dept-1"],
        action: "update",
        data: { ministryId: "min-other-church" },
      }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("même église");
  });

  it("allows update with same-church ministryId destination", async () => {
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" });
    prismaMock.department.updateMany.mockResolvedValue({ count: 1 });

    const request = new Request("http://localhost/api/departments", {
      method: "PATCH",
      body: JSON.stringify({
        ids: ["dept-1"],
        action: "update",
        data: { ministryId: "min-same-church" },
      }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(200);
  });
});
