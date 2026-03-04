import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const { GET, PUT } = await import("../route");

const makeParams = (eventId: string, deptId: string) =>
  Promise.resolve({ eventId, deptId });

describe("GET /api/events/[eventId]/departments/[deptId]/planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
  });

  it("returns planning data with members and statuses", async () => {
    const eventDept = {
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
      event: { planningDeadline: null },
      plannings: [
        { id: "p-1", memberId: "m-1", status: "EN_SERVICE" },
      ],
      department: {
        members: [
          { id: "m-1", firstName: "Jean", lastName: "Dupont" },
          { id: "m-2", firstName: "Marie", lastName: "Martin" },
        ],
      },
    };
    prismaMock.eventDepartment.findUnique.mockResolvedValue(eventDept);

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    expect(body.members[0].status).toBe("EN_SERVICE");
    expect(body.members[1].status).toBeNull();
    expect(body.deadlinePassed).toBe(false);
  });

  it("returns 404 when event-department link not found", async () => {
    prismaMock.eventDepartment.findUnique.mockResolvedValue(null);

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(404);
  });

  it("detects deadline passed", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
      event: { planningDeadline: pastDate },
      plannings: [],
      department: { members: [] },
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    const body = await res.json();
    expect(body.deadlinePassed).toBe(true);
  });
});

describe("PUT /api/events/[eventId]/departments/[deptId]/planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("upserts planning statuses", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      planningDeadline: null,
    });
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
    });
    prismaMock.planning.upsert.mockResolvedValue({
      id: "p-1",
      memberId: "m-1",
      status: "EN_SERVICE",
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning", {
      method: "PUT",
      body: JSON.stringify({
        plannings: [{ memberId: "m-1", status: "EN_SERVICE" }],
      }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.planning.upsert).toHaveBeenCalledOnce();
  });

  it("creates event-department link if missing", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      planningDeadline: null,
    });
    prismaMock.eventDepartment.findUnique.mockResolvedValue(null);
    prismaMock.eventDepartment.create.mockResolvedValue({
      id: "ed-new",
      eventId: "evt-1",
      departmentId: "dept-1",
    });
    prismaMock.planning.upsert.mockResolvedValue({
      id: "p-1",
      memberId: "m-1",
      status: "EN_SERVICE",
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning", {
      method: "PUT",
      body: JSON.stringify({
        plannings: [{ memberId: "m-1", status: "EN_SERVICE" }],
      }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.eventDepartment.create).toHaveBeenCalledOnce();
  });

  it("rejects multiple EN_SERVICE_DEBRIEF", async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      planningDeadline: null,
    });
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning", {
      method: "PUT",
      body: JSON.stringify({
        plannings: [
          { memberId: "m-1", status: "EN_SERVICE_DEBRIEF" },
          { memberId: "m-2", status: "EN_SERVICE_DEBRIEF" },
        ],
      }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(400);
  });

  it("blocks DEPARTMENT_HEAD after deadline", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockRequirePermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])
    );
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      planningDeadline: pastDate,
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning", {
      method: "PUT",
      body: JSON.stringify({
        plannings: [{ memberId: "m-1", status: "EN_SERVICE" }],
      }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(403);
  });

  it("allows ADMIN after deadline", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.event.findUnique.mockResolvedValue({
      id: "evt-1",
      planningDeadline: pastDate,
    });
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
    });
    prismaMock.planning.upsert.mockResolvedValue({
      id: "p-1",
      memberId: "m-1",
      status: "EN_SERVICE",
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning", {
      method: "PUT",
      body: JSON.stringify({
        plannings: [{ memberId: "m-1", status: "EN_SERVICE" }],
      }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
  });
});
