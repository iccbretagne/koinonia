import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockRequireChurchPermission = vi.fn();
const mockGetUserDepartmentScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
}));

const mockGetMemberScope = vi.fn();
const mockIsMemberLinkedToUser = vi.fn();
const mockResolveSubjectUserId = vi.fn();
const mockListBackupOptions = vi.fn();
vi.mock("@/modules/planning", () => ({
  getMemberScope: (...args: unknown[]) => mockGetMemberScope(...args),
  isMemberLinkedToUser: (...args: unknown[]) => mockIsMemberLinkedToUser(...args),
  resolveSubjectUserId: (...args: unknown[]) => mockResolveSubjectUserId(...args),
  listBackupOptions: (...args: unknown[]) => mockListBackupOptions(...args),
}));

const { GET } = await import("../route");

describe("GET /api/absences/backup-options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-1"] });
  });

  it("returns 400 without memberId", async () => {
    const res = await GET(new Request("http://localhost/api/absences/backup-options?churchId=church-1"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the STAR record does not exist", async () => {
    mockGetMemberScope.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );

    expect(res.status).toBe(404);
  });

  it("returns 403 for a scoped manager outside the member's departments", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["dept-mine"] });
    mockGetMemberScope.mockResolvedValue({ churchId: "church-1", departmentIds: ["dept-other"] });

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );

    expect(res.status).toBe(403);
    expect(mockResolveSubjectUserId).not.toHaveBeenCalled();
  });

  it("returns eligible:false without calling requireChurchPermission for self", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(true);
    mockResolveSubjectUserId.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ eligible: false, options: [] });
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("returns eligible:false when the target has no linked account", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    mockResolveSubjectUserId.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ eligible: false, options: [] });
    expect(mockListBackupOptions).not.toHaveBeenCalled();
  });

  it("returns the resolved backup options for an eligible target", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    mockResolveSubjectUserId.mockResolvedValue("user-target");
    mockListBackupOptions.mockResolvedValue({
      eligible: true,
      options: [{ value: "STAR:member-2", label: "Marie Martin (STAR)" }],
    });

    const res = await GET(
      new Request("http://localhost/api/absences/backup-options?churchId=church-1&memberId=member-1")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.eligible).toBe(true);
    expect(data.options).toEqual([{ value: "STAR:member-2", label: "Marie Martin (STAR)" }]);
    expect(mockListBackupOptions).toHaveBeenCalledWith("user-target", "church-1");
  });
});
