import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAuth = vi.fn();
const mockRequireChurchPermission = vi.fn();
const mockGetUserDepartmentScope = vi.fn();
const mockGetMemberScope = vi.fn();
const mockIsMemberLinkedToUser = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockRequireAuth(),
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  getUserDepartmentScope: (...args: unknown[]) => mockGetUserDepartmentScope(...args),
}));
vi.mock("@/modules/planning", () => ({
  getMemberScope: (...args: unknown[]) => mockGetMemberScope(...args),
  isMemberLinkedToUser: (...args: unknown[]) => mockIsMemberLinkedToUser(...args),
}));

const { requireAbsenceSubjectAccess } = await import("../_shared/subject-access");

const req = (qs: string) => new Request(`http://localhost/api/absences/target-options?${qs}`);

describe("requireAbsenceSubjectAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: { id: "u1" } });
    mockGetMemberScope.mockResolvedValue({ churchId: "c1", departmentIds: ["d1"] });
    mockIsMemberLinkedToUser.mockResolvedValue(false);
    mockRequireChurchPermission.mockResolvedValue({ user: { id: "u1" } });
  });

  it("exige churchId et memberId (400)", async () => {
    await expect(requireAbsenceSubjectAccess(req("churchId=c1"))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse une fiche inconnue (404) ou d'une autre église (403)", async () => {
    mockGetMemberScope.mockResolvedValueOnce(null);
    await expect(requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"))).rejects.toMatchObject({ statusCode: 404 });
    mockGetMemberScope.mockResolvedValueOnce({ churchId: "c2", departmentIds: [] });
    await expect(requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("soi-même : aucun contrôle de permission, périmètre non restreint", async () => {
    mockIsMemberLinkedToUser.mockResolvedValue(true);
    await expect(requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"))).resolves.toEqual({
      churchId: "c1",
      memberId: "m1",
      declarerScope: { scoped: false, departmentIds: [] },
    });
    expect(mockRequireChurchPermission).not.toHaveBeenCalled();
  });

  it("tiers : absences:manage, et le STAR doit être dans le périmètre d'un déclarant restreint", async () => {
    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["d1"] });
    const result = await requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"));
    expect(mockRequireChurchPermission).toHaveBeenCalledWith("absences:manage", "c1");
    expect(result.declarerScope).toEqual({ scoped: true, departmentIds: ["d1"] });

    mockGetUserDepartmentScope.mockReturnValue({ scoped: true, departmentIds: ["d9"] });
    await expect(requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("tiers avec un périmètre non restreint : périmètre non restreint", async () => {
    mockGetUserDepartmentScope.mockReturnValue({ scoped: false });
    const result = await requireAbsenceSubjectAccess(req("churchId=c1&memberId=m1"));
    expect(result.declarerScope).toEqual({ scoped: false, departmentIds: [] });
  });
});
