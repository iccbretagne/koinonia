/**
 * Tests — routes de la spec 091 : duplication (gestionnaire de la source **et** campaigns:manage
 * dans son église), définition JSON (pièce jointe), revue élargie (reopen), échéance d'une
 * contribution.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "u1", isSuperAdmin: false, churchRoles: [{ churchId: "ch-campagne", role: "ADMIN" }] } };
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => session) }));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), getClientIp: () => "ip", RATE_LIMIT_MUTATION: {}, RATE_LIMIT_SENSITIVE: {} }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
const requireCampaignManager = vi.fn();
const hasCampaignsManage = vi.fn(async () => true);
const requireAssignmentManager = vi.fn();
vi.mock("@/modules/campaigns/auth", () => ({ requireCampaignManager, hasCampaignsManage, requireAssignmentManager, userActor: () => ({ name: "Alice" }) }));
const svc = {
  duplicateCampaign: vi.fn(async () => ({ campaignId: "cp-copie", applied: true, campaign: { action: "create" } })),
  exportCampaignDefinition: vi.fn(async () => ({ definition: { format: "koinonia.campaign", version: 1 }, omittedForms: 0, omittedRules: 0 })),
  reviewAssignment: vi.fn(async () => ({ status: "IN_PROGRESS" })),
  setAssignmentDueAt: vi.fn(async () => ({ assignmentDueAt: null, dueAt: null })),
};
vi.mock("@/modules/campaigns", () => svc);

const { POST: duplicate } = await import("../[id]/duplicate/route");
const { GET: definition } = await import("../[id]/definition/route");
const { POST: review } = await import("../assignments/[id]/review/route");
const { PATCH: patchAssignment } = await import("../assignments/[id]/route");

const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const json = (method: string, body: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const access = { role: "manager", actor: { kind: "user", userId: "u1" }, assignment: { id: "as1" } };

beforeEach(() => {
  vi.clearAllMocks();
  hasCampaignsManage.mockResolvedValue(true);
  requireCampaignManager.mockResolvedValue({ session, campaign: { id: "cp1", churchId: "ch-campagne", status: "OPEN", title: "Bilan", key: "bilan-2026" } });
  requireAssignmentManager.mockResolvedValue(access);
});

describe("POST /api/campaigns/[id]/duplicate", () => {
  it("gestionnaire et campaigns:manage dans l'église de la source : 201, église de la source", async () => {
    const res = await duplicate(json("POST", { title: "Bilan 2027", keepAssignments: false }), params({ id: "cp1" }));
    expect(res.status).toBe(201);
    expect(hasCampaignsManage).toHaveBeenCalledWith(session, "ch-campagne");
    expect(svc.duplicateCampaign).toHaveBeenCalledWith("cp1", { title: "Bilan 2027", keepAssignments: false }, { userId: "u1", name: "Alice" }, "ch-campagne");
  });

  it("gestionnaire désigné sans campaigns:manage : 403 ; non gestionnaire : 404", async () => {
    hasCampaignsManage.mockResolvedValue(false);
    expect((await duplicate(json("POST", { title: "X" }), params({ id: "cp1" }))).status).toBe(403);
    const { ApiError } = await import("@/lib/api-utils");
    requireCampaignManager.mockRejectedValue(new ApiError(404, "Campagne introuvable"));
    expect((await duplicate(json("POST", { title: "X" }), params({ id: "cp1" }))).status).toBe(404);
    expect(svc.duplicateCampaign).not.toHaveBeenCalled();
  });

  it("titre manquant : 400", async () => {
    expect((await duplicate(json("POST", {}), params({ id: "cp1" }))).status).toBe(400);
  });
});

describe("GET /api/campaigns/[id]/definition", () => {
  it("JSON par défaut ; download=1 : pièce jointe <clé>.json ; journalisé", async () => {
    const res = await definition(new Request("http://localhost/x"), params({ id: "cp1" }));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain("koinonia.campaign");
    const dl = await definition(new Request("http://localhost/x?download=1"), params({ id: "cp1" }));
    expect(dl.headers.get("Content-Disposition")).toBe('attachment; filename="bilan-2026.json"');
    expect(JSON.parse(await dl.text())).toEqual({ format: "koinonia.campaign", version: 1 });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "EXPORT", details: { format: "definition" } }));
  });
});

describe("revue et échéance", () => {
  it("reopen et unvalidate acceptés, motif facultatif", async () => {
    expect((await review(json("POST", { action: "reopen" }), params({ id: "as1" }))).status).toBe(200);
    expect(svc.reviewAssignment).toHaveBeenCalledWith(access, { action: "reopen" });
    expect((await review(json("POST", { action: "unvalidate", reason: "Erreur" }), params({ id: "as1" }))).status).toBe(200);
    expect((await review(json("POST", { action: "autre" }), params({ id: "as1" }))).status).toBe(400);
  });

  it("PATCH échéance : jour, null ; corps invalide 400", async () => {
    expect((await patchAssignment(json("PATCH", { dueAt: "2026-12-11" }), params({ id: "as1" }))).status).toBe(200);
    expect(svc.setAssignmentDueAt).toHaveBeenCalledWith(access, "2026-12-11");
    await patchAssignment(json("PATCH", { dueAt: null }), params({ id: "as1" }));
    expect(svc.setAssignmentDueAt).toHaveBeenLastCalledWith(access, null);
    expect((await patchAssignment(json("PATCH", { dueAt: "demain" }), params({ id: "as1" }))).status).toBe(400);
  });
});
