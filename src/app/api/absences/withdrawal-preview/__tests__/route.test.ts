import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-utils";

const mockRequireAbsenceSubjectAccess = vi.fn();
vi.mock("../../_shared/subject-access", () => ({
  requireAbsenceSubjectAccess: (...args: unknown[]) => mockRequireAbsenceSubjectAccess(...args),
}));

const mockFindWithdrawableServicesForAbsence = vi.fn();
vi.mock("@/modules/planning", () => ({
  findWithdrawableServicesForAbsence: (...args: unknown[]) => mockFindWithdrawableServicesForAbsence(...args),
}));

const { GET } = await import("../route");

const base = "http://localhost/api/absences/withdrawal-preview?churchId=church-1&memberId=member-1";
const period = "&startDate=2026-11-01T00:00:00.000Z&endDate=2026-11-10T00:00:00.000Z";

describe("GET /api/absences/withdrawal-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAbsenceSubjectAccess.mockResolvedValue({ churchId: "church-1", memberId: "member-1" });
    mockFindWithdrawableServicesForAbsence.mockResolvedValue([
      { eventId: "ev-1", title: "Culte", date: "2026-11-02T10:00:00.000Z", departmentId: "dept-1", departmentName: "Choristes" },
    ]);
  });

  it("renvoie les services que la période désisterait (tous départements par défaut)", async () => {
    const res = await GET(new Request(base + period));

    expect(res.status).toBe(200);
    expect((await res.json()).services).toHaveLength(1);
    expect(mockFindWithdrawableServicesForAbsence).toHaveBeenCalledWith(undefined, {
      memberId: "member-1",
      churchId: "church-1",
      targeting: {
        kind: "PERIOD",
        startDate: new Date("2026-11-01T00:00:00.000Z"),
        endDate: new Date("2026-11-10T00:00:00.000Z"),
        allDepartments: true,
        departmentIds: [],
      },
    });
  });

  it("transmet la restriction départementale", async () => {
    await GET(new Request(base + period + "&allDepartments=false&departmentIds=dept-1,dept-2"));

    expect(mockFindWithdrawableServicesForAbsence).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        targeting: expect.objectContaining({ allDepartments: false, departmentIds: ["dept-1", "dept-2"] }),
      })
    );
  });

  it("refuse une requête sans dates (400)", async () => {
    const res = await GET(new Request(base));
    expect(res.status).toBe(400);
    expect(mockFindWithdrawableServicesForAbsence).not.toHaveBeenCalled();
  });

  it("refuse une fin antérieure au début (400)", async () => {
    const res = await GET(new Request(base + "&startDate=2026-11-10T00:00:00.000Z&endDate=2026-11-01T00:00:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("relaie le refus de la garde (STAR hors périmètre)", async () => {
    mockRequireAbsenceSubjectAccess.mockRejectedValue(new ApiError(403, "Ce STAR n'appartient pas à votre périmètre"));

    const res = await GET(new Request(base + period));

    expect(res.status).toBe(403);
    expect(mockFindWithdrawableServicesForAbsence).not.toHaveBeenCalled();
  });
});
