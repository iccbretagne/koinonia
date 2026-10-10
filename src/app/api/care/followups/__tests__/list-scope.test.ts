import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La liste suit la règle du détail et de la page /care : vue d'ensemble pour `care:view` /
 * `care:qualify`, sinon les seuls suivis dont l'appelant est l'accompagnant en charge.
 */

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "user-1" } })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const mockGetCareAccess = vi.fn();
const mockList = vi.fn();
vi.mock("@/modules/care", () => ({
  getCareAccess: (...args: unknown[]) => mockGetCareAccess(...args),
  listMsdpFollowUps: (...args: unknown[]) => mockList(...args),
  canStartFollowUp: vi.fn(),
  startMsdpFollowUpFromIntegrationRequest: vi.fn(),
}));

const { GET } = await import("../route");

const followUps = [
  { id: "f-mine", assignedConseillerMsdpId: "user-1", assignedProfile: null },
  { id: "f-profile", assignedConseillerMsdpId: null, assignedProfile: { id: "profile-1" } },
  { id: "f-other", assignedConseillerMsdpId: "user-2", assignedProfile: { id: "profile-2" } },
];

const list = async () => {
  const res = await GET(new Request("http://k.test/api/care/followups?churchId=church-1"));
  return { status: res.status, ids: res.ok ? ((await res.json()) as { id: string }[]).map((f) => f.id) : [] };
};

describe("GET /api/care/followups — périmètre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(followUps);
  });

  it("un accompagnant ne voit que les suivis dont il est en charge", async () => {
    mockGetCareAccess.mockResolvedValue({ canOverview: false, ownProfileIds: ["profile-1"], userId: "user-1" });

    await expect(list()).resolves.toEqual({ status: 200, ids: ["f-mine", "f-profile"] });
  });

  it("sans aucun suivi en charge, l'accès est refusé", async () => {
    mockGetCareAccess.mockResolvedValue({ canOverview: false, ownProfileIds: [], userId: "user-3" });
    mockList.mockResolvedValue([followUps[2]]);

    expect((await list()).status).toBe(403);
  });

  it("la vue d'ensemble voit tous les suivis", async () => {
    mockGetCareAccess.mockResolvedValue({ canOverview: true, ownProfileIds: [], userId: "user-1" });

    expect((await list()).ids).toEqual(["f-mine", "f-profile", "f-other"]);
  });
});
