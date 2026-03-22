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

const { PUT } = await import("../route");

const makeParams = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

describe("PUT /api/events/[eventId]/report — cross-tenant sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      churchId: "church-1",
      reportEnabled: true,
    });
  });

  it("rejects report with cross-church departmentId in sections", async () => {
    // Only 1 of 2 departments found in church
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-1" }]);

    const request = new Request("http://localhost/api/events/evt-1/report", {
      method: "PUT",
      body: JSON.stringify({
        sections: [
          { label: "Section A", departmentId: "dept-1" },
          { label: "Section B", departmentId: "dept-other-church" },
        ],
      }),
    });
    const res = await PUT(request, makeParams("evt-1"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("église");
  });

  it("allows report with all departments in same church", async () => {
    prismaMock.department.findMany.mockResolvedValue([
      { id: "dept-1" },
      { id: "dept-2" },
    ]);
    prismaMock.eventReport.upsert.mockResolvedValue({
      id: "report-1",
      eventId: "evt-1",
      sections: [],
      author: { id: "user-1", name: "Test" },
    });

    const request = new Request("http://localhost/api/events/evt-1/report", {
      method: "PUT",
      body: JSON.stringify({
        sections: [
          { label: "Section A", departmentId: "dept-1" },
          { label: "Section B", departmentId: "dept-2" },
        ],
      }),
    });
    const res = await PUT(request, makeParams("evt-1"));

    expect(res.status).toBe(200);
  });

  it("allows sections without departmentId", async () => {
    prismaMock.eventReport.upsert.mockResolvedValue({
      id: "report-1",
      eventId: "evt-1",
      sections: [],
      author: { id: "user-1", name: "Test" },
    });

    const request = new Request("http://localhost/api/events/evt-1/report", {
      method: "PUT",
      body: JSON.stringify({
        sections: [
          { label: "Notes générales" },
        ],
      }),
    });
    const res = await PUT(request, makeParams("evt-1"));

    expect(res.status).toBe(200);
  });
});
