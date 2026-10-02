import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

const mockRequirePermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
const mockDeptAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...a: unknown[]) => mockRequirePermission(...a),
  resolveChurchId: (...a: unknown[]) => mockResolveChurchId(...a),
  requireDepartmentAccess: (...a: unknown[]) => mockDeptAccess(...a),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();
const mockAsk = vi.fn();
const mockRelance = vi.fn();
vi.mock("@/modules/planning", () => ({
  getAvailabilitySettings: (...a: unknown[]) => mockGetSettings(...a),
  updateAvailabilitySettings: (...a: unknown[]) => mockUpdateSettings(...a),
  askTeam: (...a: unknown[]) => mockAsk(...a),
  manualRelance: (...a: unknown[]) => mockRelance(...a),
  assertEventDepartment: async () => {
    if (!(await prismaMock.eventDepartment.findUnique({} as never))) throw new ApiError(404, "absent");
  },
}));

const settings = await import("../settings/route");
const ask = await import("@/app/api/events/[eventId]/departments/[deptId]/availability/route");

describe("/api/availability/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
    mockGetSettings.mockResolvedValue({ enabled: true, openMonthsBefore: 2, closeDaysBefore: 7, relanceDaysBefore: 3 });
    mockUpdateSettings.mockImplementation(async (_c: string, d: unknown) => d);
  });

  it("GET exige availability:settings dans l'église demandée", async () => {
    const res = await settings.GET(new Request("http://localhost/api/availability/settings?churchId=church-1"));
    expect(res.status).toBe(200);
    expect(mockRequirePermission).toHaveBeenCalledWith("availability:settings", "church-1");
  });

  it("GET refuse sans permission", async () => {
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await settings.GET(new Request("http://localhost/api/availability/settings?churchId=church-1"));
    expect(res.status).toBe(403);
    expect(mockGetSettings).not.toHaveBeenCalled();
  });

  it("PUT enregistre un réglage valide", async () => {
    const body = { churchId: "church-1", enabled: false, openMonthsBefore: 3, closeDaysBefore: 10, relanceDaysBefore: 4 };
    const res = await settings.PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    expect(mockUpdateSettings).toHaveBeenCalledWith("church-1", { enabled: false, openMonthsBefore: 3, closeDaysBefore: 10, relanceDaysBefore: 4 });
  });

  it.each([
    { openMonthsBefore: 0 },
    { openMonthsBefore: 7 },
    { closeDaysBefore: 0 },
    { relanceDaysBefore: 31 },
    { enabled: "yes" },
  ])("PUT rejette %o (400)", async (override) => {
    const body = { churchId: "church-1", enabled: true, openMonthsBefore: 2, closeDaysBefore: 7, relanceDaysBefore: 3, ...override };
    const res = await settings.PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(400);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});

describe("POST /api/events/[eventId]/departments/[deptId]/availability", () => {
  const params = { params: Promise.resolve({ eventId: "evt-1", deptId: "dept-1" }) };
  const post = (action: string) =>
    ask.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ action }) }), params);

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    mockRequirePermission.mockResolvedValue(createAdminSession());
    prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
    mockAsk.mockResolvedValue({ notified: 2 });
    mockRelance.mockResolvedValue({ notified: 1 });
  });

  it("ask : exige planning:edit dans l'église de l'événement et le périmètre du département", async () => {
    const res = await post("ask");
    expect(res.status).toBe(200);
    expect(mockRequirePermission).toHaveBeenCalledWith("planning:edit", "church-1");
    expect(mockDeptAccess).toHaveBeenCalledWith(expect.anything(), "church-1", "dept-1");
    expect(mockAsk).toHaveBeenCalledWith({ eventId: "evt-1", departmentId: "dept-1", actorId: "user-1" });
  });

  it("relance : appelle la relance manuelle", async () => {
    await post("relance");
    expect(mockRelance).toHaveBeenCalledWith({ eventId: "evt-1", departmentId: "dept-1" });
  });

  it("404 si le département ne participe pas à l'événement", async () => {
    prismaMock.eventDepartment.findUnique.mockResolvedValue(null);
    const res = await post("ask");
    expect(res.status).toBe(404);
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("400 pour une action inconnue", async () => {
    const res = await post("spam");
    expect(res.status).toBe(400);
  });

  it("refuse hors périmètre du département", async () => {
    mockDeptAccess.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    const res = await post("ask");
    expect(res.status).toBe(403);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
