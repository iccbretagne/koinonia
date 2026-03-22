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

const { PATCH } = await import("../../events/route");

describe("PATCH /api/events (bulk) — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("rejects bulk delete when IDs span multiple churches", async () => {
    mockResolveChurchId
      .mockResolvedValueOnce("church-1") // first ID
      .mockResolvedValueOnce("church-1") // validation loop: id 1
      .mockResolvedValueOnce("church-2"); // validation loop: id 2

    const request = new Request("http://localhost/api/events", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["evt-1", "evt-2"], action: "delete" }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("même église");
  });

  it("allows bulk delete when all IDs belong to same church", async () => {
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.eventDepartment.findMany.mockResolvedValue([]);
    prismaMock.planning.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.eventDepartment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.event.deleteMany.mockResolvedValue({ count: 2 });

    const request = new Request("http://localhost/api/events", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["evt-1", "evt-2"], action: "delete" }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(200);
  });
});
