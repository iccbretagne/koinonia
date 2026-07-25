import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockRequireChurchPermission = vi.fn();
const mockGetUserDepartmentScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
}));

const mockDeclareAbsence = vi.fn();
const mockCancelAbsence = vi.fn();
const mockGetMemberScope = vi.fn();
const mockIsMemberLinkedToUser = vi.fn();
vi.mock("@/modules/planning", () => ({
  declareAbsence: (...args: unknown[]) => mockDeclareAbsence(...args),
  cancelAbsence: (...args: unknown[]) => mockCancelAbsence(...args),
  findAbsenceConflicts: vi.fn().mockResolvedValue([]),
  getMemberScope: (...args: unknown[]) => mockGetMemberScope(...args),
  isMemberLinkedToUser: (...args: unknown[]) => mockIsMemberLinkedToUser(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, POST } = await import("../route");
const { PATCH } = await import("../[id]/route");

const validBody = {
  churchId: "church-1",
  memberId: "member-1",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-10T00:00:00.000Z",
};

describe("GET /api/absences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 without churchId", async () => {
    const res = await GET(new Request("http://localhost/api/absences"));
    expect(res.status).toBe(400);
  });

  it("scope=self does not require any permission, only auth", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession());
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/absences?churchId=church-1&scope=self"));

    expect(res.status).toBe(200);
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("scope=all requires absences:view and returns 403 when missing", async () => {
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await GET(new Request("http://localhost/api/absences?churchId=church-1&scope=all"));

    expect(res.status).toBe(403);
  });
});

describe("POST /api/absences — authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-1"] });
    mockDeclareAbsence.mockResolvedValue({ id: "abs-1" });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid body", async () => {
    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the STAR record does not exist", async () => {
    mockGetMemberScope.mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(404);
  });

  it("returns 403 when memberId belongs to another church", async () => {
    mockGetMemberScope.mockResolvedValue({ churchId: "church-other", departmentIds: ["dept-1"] });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(403);
  });

  it("allows self-declaration without absences:manage permission", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(true);

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(201);
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
    expect(mockDeclareAbsence).toHaveBeenCalled();
  });

  it("returns 403 for a STAR declaring on behalf of another STAR (no absences:manage)", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(403);
    expect(mockDeclareAbsence).not.toHaveBeenCalled();
  });

  it("returns 403 when a scoped manager declares for a member outside their departments", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-mine"] });
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-other"] });

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(403);
    expect(mockDeclareAbsence).not.toHaveBeenCalled();
  });

  it("allows a scoped manager to declare for a member within their departments", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-1"] });

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(201);
    expect(mockDeclareAbsence).toHaveBeenCalled();
  });

  it("allows a global manager (unscoped) to declare for any member", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(validBody) }));

    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/absences/[id] — authorization", () => {
  const existingAbsence = { id: "abs-1", churchId: "church-1", memberId: "member-1", createdById: "user-owner", status: "ACTIVE" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    prismaMock.absence.findUnique.mockResolvedValue(existingAbsence as never);
    mockCancelAbsence.mockResolvedValue({ ...existingAbsence, status: "CANCELLED" });
  });

  it("returns 404 when the absence does not exist", async () => {
    prismaMock.absence.findUnique.mockResolvedValue(null);

    const res = await PATCH(
      new Request("http://localhost/api/absences/unknown", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "unknown" }) }
    );

    expect(res.status).toBe(404);
  });

  it("allows the creator to cancel without absences:manage", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-owner" } });
    mockIsMemberLinkedToUser.mockResolvedValue(false);

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("allows the linked STAR themselves to cancel", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-star" } });
    mockIsMemberLinkedToUser.mockResolvedValue(true);

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("returns 403 for an unrelated user without absences:manage", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-stranger" } });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockCancelAbsence).not.toHaveBeenCalled();
  });

  it("returns 403 for a scoped manager outside the member's departments", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-resp" } });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-mine"] });
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-other"] });

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockCancelAbsence).not.toHaveBeenCalled();
  });

  it("allows a global manager (unscoped) to cancel any absence", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "admin-1" } });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockCancelAbsence).toHaveBeenCalled();
  });
});
