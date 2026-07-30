import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

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
const mockUpdateAbsence = vi.fn();
const mockGetMemberScope = vi.fn();
const mockIsMemberLinkedToUser = vi.fn();
const mockValidateBackupTargets = vi.fn();
vi.mock("@/modules/planning", () => ({
  declareAbsence: (...args: unknown[]) => mockDeclareAbsence(...args),
  cancelAbsence: (...args: unknown[]) => mockCancelAbsence(...args),
  updateAbsence: (...args: unknown[]) => mockUpdateAbsence(...args),
  findAbsenceConflicts: vi.fn().mockResolvedValue([]),
  getMemberScope: (...args: unknown[]) => mockGetMemberScope(...args),
  isMemberLinkedToUser: (...args: unknown[]) => mockIsMemberLinkedToUser(...args),
  validateBackupTargets: (...args: unknown[]) => mockValidateBackupTargets(...args),
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

  it("scope=all enriches each absence with its backups", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    prismaMock.absence.findMany.mockResolvedValue([
      {
        id: "abs-1",
        churchId: "church-1",
        memberId: "member-1",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-10"),
        reason: null,
        status: "ACTIVE",
        createdById: "user-1",
        createdAt: new Date(),
        member: { id: "member-1", firstName: "Jean", lastName: "Dupont", departments: [] },
        createdBy: { id: "user-1", name: "Jean Dupont", displayName: null },
        backups: [
          {
            id: "backup-1",
            type: "STAR",
            member: { id: "member-2", firstName: "Marie", lastName: "Martin" },
            userChurchRole: null,
          },
          {
            id: "backup-2",
            type: "RESPONSIBLE",
            member: null,
            userChurchRole: { id: "role-1", role: "MINISTER", user: { name: "Paul Petit", displayName: null } },
          },
        ],
      },
    ] as never);

    const res = await GET(new Request("http://localhost/api/absences?churchId=church-1&scope=all"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.absences[0].backups).toEqual([
      { id: "backup-1", type: "STAR", targetId: "member-2", name: "Marie Martin", role: undefined },
      { id: "backup-2", type: "RESPONSIBLE", targetId: "role-1", name: "Paul Petit", role: "MINISTER" },
    ]);
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

describe("POST /api/absences — backups", () => {
  const bodyWithBackup = { ...validBody, backups: [{ type: "STAR", memberId: "member-backup" }] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-1"] });
    mockDeclareAbsence.mockResolvedValue({ id: "abs-1" });
  });

  it("returns 403 for backups on an absence declared for a third party", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(bodyWithBackup) }));

    expect(res.status).toBe(403);
    expect(mockValidateBackupTargets).not.toHaveBeenCalled();
    expect(mockDeclareAbsence).not.toHaveBeenCalled();
  });

  it("returns 403 when validateBackupTargets rejects (backup out of scope / role ineligible)", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(true);
    mockValidateBackupTargets.mockRejectedValue(new ApiError(403, "forbidden"));

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(bodyWithBackup) }));

    expect(res.status).toBe(403);
    expect(mockDeclareAbsence).not.toHaveBeenCalled();
  });

  it("passes backups to declareAbsence when self and validated", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(true);
    mockValidateBackupTargets.mockResolvedValue(undefined);

    const res = await POST(new Request("http://localhost/api/absences", { method: "POST", body: JSON.stringify(bodyWithBackup) }));

    expect(res.status).toBe(201);
    expect(mockValidateBackupTargets).toHaveBeenCalled();
    expect(mockDeclareAbsence).toHaveBeenCalledWith(
      expect.objectContaining({ backups: bodyWithBackup.backups })
    );
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

describe("PATCH /api/absences/[id] — action update", () => {
  const existingAbsence = { id: "abs-1", churchId: "church-1", memberId: "member-1", createdById: "user-owner", status: "ACTIVE" };
  const updateBody = { action: "update", startDate: "2026-09-02T00:00:00.000Z", endDate: "2026-09-12T00:00:00.000Z" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-owner" } });
    prismaMock.absence.findUnique.mockResolvedValue(existingAbsence as never);
    mockUpdateAbsence.mockResolvedValue({ ...existingAbsence });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
  });

  it("allows the creator to update", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify(updateBody) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockUpdateAbsence).toHaveBeenCalled();
  });

  it("returns 403 for an unrelated user without absences:manage", async () => {
    mockRequireAuth.mockResolvedValue({ ...createAdminSession(), user: { ...createAdminSession().user, id: "user-stranger" } });
    mockRequireChurchPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify(updateBody) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockUpdateAbsence).not.toHaveBeenCalled();
  });

  it("propagates a 409 from the service (absence already passed)", async () => {
    mockUpdateAbsence.mockRejectedValue(new ApiError(409, "Absence déjà passée, non modifiable"));

    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", { method: "PATCH", body: JSON.stringify(updateBody) }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(409);
  });

  it("returns 403 for backups on an update when not self", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", {
        method: "PATCH",
        body: JSON.stringify({ ...updateBody, backups: [{ type: "STAR", memberId: "member-backup" }] }),
      }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockUpdateAbsence).not.toHaveBeenCalled();
  });

  it("returns 400 when endDate is before startDate", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/absences/abs-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "update", startDate: "2026-09-12T00:00:00.000Z", endDate: "2026-09-02T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: "abs-1" }) }
    );

    expect(res.status).toBe(400);
  });
});
