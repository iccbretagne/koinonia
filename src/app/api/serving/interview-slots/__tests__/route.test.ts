import { beforeEach, describe, expect, it, vi } from "vitest";

const createSlots = vi.fn();
const listSlots = vi.fn();
vi.mock("@/modules/serving", () => ({
  createSlots: (...a: unknown[]) => createSlots(...a),
  listSlots: (...a: unknown[]) => listSlots(...a),
  listInterviewers: vi.fn().mockResolvedValue([]),
  countToComplete: vi.fn().mockResolvedValue(0),
}));
const requireServingManage = vi.fn();
vi.mock("@/modules/serving/auth", () => ({ requireServingManage: (...a: unknown[]) => requireServingManage(...a) }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: { windowMs: 60_000, max: 30 } }));

const { GET, POST } = await import("../route");

const body = { churchId: "church-1", slots: [{ day: "2026-12-01", time: "18:00", interviewerId: "u-pvs" }] };

beforeEach(() => {
  vi.clearAllMocks();
  listSlots.mockResolvedValue([]);
  createSlots.mockResolvedValue(1);
});

describe("/api/serving/interview-slots", () => {
  it("hors équipe PVS et administration : 403, rien n'est lu", async () => {
    requireServingManage.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(new Request("http://localhost/api/serving/interview-slots?churchId=church-1"));
    expect(res.status).toBe(403);
    expect(listSlots).not.toHaveBeenCalled();
  });

  it("vérifie le droit dans l'église visée, crée et journalise", async () => {
    requireServingManage.mockResolvedValue({ userId: "u-pvs" });
    const res = await POST(new Request("http://localhost/api/serving/interview-slots", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
    expect(requireServingManage).toHaveBeenCalledWith("church-1");
    expect(createSlots).toHaveBeenCalledWith("church-1", { slots: [expect.objectContaining({ durationMinutes: 30 })] }, "u-pvs");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "ServingInterviewSlot" }));
  });
});
