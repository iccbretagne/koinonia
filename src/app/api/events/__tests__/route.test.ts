import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const { GET, POST, PATCH } = await import("../route");

describe("GET /api/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("returns all events", async () => {
    const events = [
      {
        id: "evt-1",
        title: "Culte",
        type: "CULTE",
        date: new Date("2026-03-08"),
        churchId: "church-1",
        church: { id: "church-1", name: "ICC Rennes" },
        eventDepts: [],
      },
    ];
    prismaMock.event.findMany.mockResolvedValue(events);

    const request = new Request("http://localhost/api/events?churchId=church-1");
    const res = await GET(request);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Culte");
  });

  it("filters by churchId", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/events?churchId=church-1");
    await GET(request);

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-1" },
      })
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const request = new Request("http://localhost/api/events?churchId=church-1");
    const res = await GET(request);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("creates a single event", async () => {
    const created = {
      id: "evt-new",
      title: "Culte du dimanche",
      type: "CULTE",
      date: new Date("2026-03-15"),
      churchId: "church-1",
      church: { id: "church-1", name: "ICC Rennes" },
      eventDepts: [],
    };
    prismaMock.event.create.mockResolvedValue(created);

    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({
        title: "Culte du dimanche",
        type: "CULTE",
        date: "2026-03-15",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Culte du dimanche");
  });

  it("creates recurring events", async () => {
    const parent = {
      id: "evt-parent",
      title: "Culte",
      type: "CULTE",
      date: new Date("2026-03-01"),
      churchId: "church-1",
      isRecurrenceParent: true,
      church: { id: "church-1", name: "ICC Rennes" },
      eventDepts: [],
    };

    // $transaction calls the callback with prismaMock
    prismaMock.event.create.mockResolvedValue(parent);
    prismaMock.event.findUnique.mockResolvedValue(parent);

    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({
        title: "Culte",
        type: "CULTE",
        date: "2026-03-01",
        churchId: "church-1",
        recurrenceRule: "weekly",
        recurrenceEnd: "2026-03-22",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.childrenCreated).toBe(3); // March 8, 15, 22
  });

  it("returns 400 for missing required fields", async () => {
    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({ title: "Missing fields" }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date (DoS prevention)", async () => {
    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({
        title: "Culte",
        type: "CULTE",
        date: "not-a-date",
        churchId: "church-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid recurrenceEnd (DoS prevention)", async () => {
    const request = new Request("http://localhost/api/events", {
      method: "POST",
      body: JSON.stringify({
        title: "Culte",
        type: "CULTE",
        date: "2026-03-01",
        churchId: "church-1",
        recurrenceRule: "weekly",
        recurrenceEnd: "not-a-date",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/events (bulk)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("deletes events in bulk", async () => {
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
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });

  it("updates events in bulk", async () => {
    prismaMock.event.updateMany.mockResolvedValue({ count: 1 });

    const request = new Request("http://localhost/api/events", {
      method: "PATCH",
      body: JSON.stringify({
        ids: ["evt-1"],
        action: "update",
        data: { title: "Nouveau titre" },
      }),
    });
    const res = await PATCH(request);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
  });
});
