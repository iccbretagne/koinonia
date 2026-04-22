import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createDepartmentHeadSession,
} from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
const mockGetUserDepartmentScope = vi.fn().mockReturnValue({ scoped: false });
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
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

// Mock department church verification (cross-tenant check)
const mockDeptChurchCheck = { ministry: { churchId: "church-1" } };

describe("GET /api/events/[eventId]/departments/[deptId]/planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.department.findUnique.mockResolvedValue(mockDeptChurchCheck as never);
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
        memberDepts: [
          { member: { id: "m-1", firstName: "Jean", lastName: "Dupont" } },
          { member: { id: "m-2", firstName: "Marie", lastName: "Martin" } },
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

  it("returns members with no statuses when event-department link not found", async () => {
    prismaMock.eventDepartment.findUnique.mockResolvedValue(null);
    // Second department.findUnique call (with members include) in the fallback path
    prismaMock.department.findUnique
      .mockResolvedValueOnce(mockDeptChurchCheck as never) // cross-tenant check
      .mockResolvedValueOnce({
        id: "dept-1",
        memberDepts: [{ member: { id: "m-1", firstName: "Jean", lastName: "Dupont" } }],
      } as never); // fallback path
    prismaMock.event.findUnique.mockResolvedValue({ id: "evt-1", planningDeadline: null } as never);

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].status).toBeNull();
  });

  it("detects deadline passed", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
      event: { planningDeadline: pastDate },
      plannings: [],
      department: { memberDepts: [] },
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    const body = await res.json();
    expect(body.deadlinePassed).toBe(true);
    expect(body.canBypassDeadline).toBe(true); // ADMIN can bypass
  });
});

describe("PUT /api/events/[eventId]/departments/[deptId]/planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.department.findUnique.mockResolvedValue(mockDeptChurchCheck as never);
    // Mock member validation: return members matching the requested IDs
    prismaMock.member.findMany.mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
      const ids = args?.where?.id?.in ?? [];
      return Promise.resolve(ids.map((id: string) => ({ id })));
    });
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

// ── P0-2 : Department scope ──────────────────────────────────────────────────

describe("P0-2 : Department scope — DEPARTMENT_HEAD ne peut pas accéder à un autre département", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET : retourne 403 si DEPARTMENT_HEAD scoped à dept-A tente d'accéder à dept-B", async () => {
    // dept-A scoped, accès à dept-B
    mockRequirePermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "Son" }])
    );
    // Le scope est scoped:true, departmentIds: ["dept-A"]
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-A"] });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-B/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-B") });

    expect(res.status).toBe(403);
  });

  it("GET : autorise DEPARTMENT_HEAD à accéder à son propre département", async () => {
    mockRequirePermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-1", name: "Son" }])
    );
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-1"] });
    prismaMock.department.findUnique.mockResolvedValue(
      { ministry: { churchId: "church-1" } } as never
    );
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-1",
      event: { planningDeadline: null },
      plannings: [],
      department: { memberDepts: [] },
    });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-1/planning");
    const res = await GET(request, { params: makeParams("evt-1", "dept-1") });

    expect(res.status).toBe(200);
  });

  it("PUT : retourne 403 si DEPARTMENT_HEAD scoped à dept-A tente d'éditer dept-B", async () => {
    mockRequirePermission.mockResolvedValue(
      createDepartmentHeadSession([{ id: "dept-A", name: "Son" }])
    );
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-A"] });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-B/planning", {
      method: "PUT",
      body: JSON.stringify({ plannings: [{ memberId: "m-1", status: "EN_SERVICE" }] }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-B") });

    expect(res.status).toBe(403);
  });

  it("PUT : ADMIN (scoped: false) peut éditer n'importe quel département", async () => {
    mockRequirePermission.mockResolvedValue(createAdminSession());
    // Par défaut mockGetUserDepartmentScope retourne { scoped: false }
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    prismaMock.event.findUnique.mockResolvedValue({ id: "evt-1", planningDeadline: null });
    prismaMock.department.findUnique.mockResolvedValue(
      { ministry: { churchId: "church-1" } } as never
    );
    prismaMock.eventDepartment.findUnique.mockResolvedValue({
      id: "ed-1",
      eventId: "evt-1",
      departmentId: "dept-X",
    });
    prismaMock.member.findMany.mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
      const ids = args?.where?.id?.in ?? [];
      return Promise.resolve(ids.map((id: string) => ({ id })));
    });
    prismaMock.planning.upsert.mockResolvedValue({ id: "p-1", memberId: "m-1", status: "EN_SERVICE" });

    const request = new Request("http://localhost/api/events/evt-1/departments/dept-X/planning", {
      method: "PUT",
      body: JSON.stringify({ plannings: [{ memberId: "m-1", status: "EN_SERVICE" }] }),
    });
    const res = await PUT(request, { params: makeParams("evt-1", "dept-X") });

    expect(res.status).toBe(200);
  });
});

// Note : les tests unitaires directs sur getUserDepartmentScope (BLOCKER-2)
// sont dans le fichier dept-scope.test.ts (fichier séparé sans mock @/lib/auth)
