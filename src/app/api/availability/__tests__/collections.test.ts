import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({ requireChurchPermission: (...a: unknown[]) => mockRequirePermission(...a) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const mockOpen = vi.fn();
const mockList = vi.fn();
vi.mock("@/modules/planning", () => ({
  openCollectionNow: (...a: unknown[]) => mockOpen(...a),
  listCollectionMonths: (...a: unknown[]) => mockList(...a),
}));

const { GET, POST } = await import("../collections/route");

const post = (body: unknown) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));

describe("/api/availability/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createAdminSession());
  });

  it("GET exige availability:settings", async () => {
    mockList.mockResolvedValue([]);
    expect((await GET(new Request("http://localhost/api/availability/collections?churchId=church-1"))).status).toBe(200);
    expect(mockRequirePermission).toHaveBeenCalledWith("availability:settings", "church-1");
  });

  it("POST ouvre la collecte du mois demandé", async () => {
    mockOpen.mockResolvedValue({ closesAt: new Date(), notified: 4 });
    const res = await post({ churchId: "church-1", month: "2026-12" });
    expect(res.status).toBe(201);
    expect(mockOpen).toHaveBeenCalledWith("church-1", new Date("2026-12-01T00:00:00.000Z"));
  });

  it("POST refuse sans permission et ne déclenche rien", async () => {
    mockRequirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await post({ churchId: "church-1", month: "2026-12" })).status).toBe(403);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("POST rejette un mois mal formé et relaie un 409", async () => {
    expect((await post({ churchId: "church-1", month: "décembre" })).status).toBe(400);
    mockOpen.mockRejectedValue(new ApiError(409, "déjà ouverte"));
    expect((await post({ churchId: "church-1", month: "2026-12" })).status).toBe(409);
  });
});
