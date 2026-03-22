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

const { POST } = await import("../route");

const makeParams = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

describe("POST /api/events/[eventId]/duplicate-planning — cross-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("rejects duplication to event in different church", async () => {
    mockResolveChurchId
      .mockResolvedValueOnce("church-1")  // source event
      .mockResolvedValueOnce("church-2"); // target event

    const request = new Request("http://localhost/api/events/evt-1/duplicate-planning", {
      method: "POST",
      body: JSON.stringify({ targetEventId: "evt-other-church" }),
    });
    const res = await POST(request, makeParams("evt-1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("même église");
  });

  it("allows duplication within same church", async () => {
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.eventDepartment.findMany
      .mockResolvedValueOnce([
        { departmentId: "dept-1", plannings: [{ memberId: "m-1", status: "EN_SERVICE" }] },
      ])
      .mockResolvedValueOnce([
        { id: "ed-target", departmentId: "dept-1" },
      ]);
    prismaMock.planning.upsert.mockResolvedValue({ id: "p-new" });

    const request = new Request("http://localhost/api/events/evt-1/duplicate-planning", {
      method: "POST",
      body: JSON.stringify({ targetEventId: "evt-2" }),
    });
    const res = await POST(request, makeParams("evt-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.copied).toBe(1);
  });

  it("rejects duplication to self", async () => {
    mockResolveChurchId.mockResolvedValue("church-1");

    const request = new Request("http://localhost/api/events/evt-1/duplicate-planning", {
      method: "POST",
      body: JSON.stringify({ targetEventId: "evt-1" }),
    });
    const res = await POST(request, makeParams("evt-1"));

    expect(res.status).toBe(400);
  });
});
