/**
 * Tests — POST /api/campaigns/import (spec 090) : avec `campaignId`, l'église qui fait foi est
 * celle de la campagne (jamais l'église courante) et la clé de la définition doit être la sienne.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: { id: "u1", isSuperAdmin: false, churchRoles: [{ churchId: "ch-courante", role: "ADMIN" }] } };
const getCurrentChurchId = vi.fn(async () => "ch-courante");
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => session), getCurrentChurchId }));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));
const requireCampaignManager = vi.fn();
const hasCampaignsManage = vi.fn(async () => true);
vi.mock("@/modules/campaigns/auth", () => ({
  requireCampaignManager,
  hasCampaignsManage,
  isCampaignManager: vi.fn(async () => true),
  isChurchMember: vi.fn(() => true),
  userActor: () => ({ name: "Alice" }),
}));
const importCampaign = vi.fn(async () => ({ campaignId: "cp1", applied: false }));
const findCampaignByKey = vi.fn(async () => null);
vi.mock("@/modules/campaigns", () => ({ importCampaign, findCampaignByKey }));

const { POST } = await import("../import/route");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/campaigns/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const definition = (key: string) => ({ format: "koinonia.campaign", version: 1, campaign: { key, title: "Bilan" }, forms: [] });

beforeEach(() => {
  vi.clearAllMocks();
  requireCampaignManager.mockResolvedValue({
    session,
    campaign: { id: "cp1", churchId: "ch-campagne", status: "OPEN", title: "Bilan", key: "bilan" },
  });
});

describe("POST /api/campaigns/import", () => {
  it("avec campaignId : église de la campagne, jamais de création", async () => {
    const res = await post({ definition: definition("bilan"), dryRun: true, campaignId: "cp1" });
    expect(res.status).toBe(200);
    expect(requireCampaignManager).toHaveBeenCalledWith("cp1");
    expect(importCampaign).toHaveBeenCalledWith(expect.objectContaining({ churchId: "ch-campagne", canCreate: false }));
    expect(getCurrentChurchId).not.toHaveBeenCalled();
  });

  it("avec campaignId : autre clé ⇒ 400, rien n'est importé", async () => {
    const res = await post({ definition: definition("autre"), dryRun: false, campaignId: "cp1" });
    expect(res.status).toBe(400);
    expect(importCampaign).not.toHaveBeenCalled();
  });

  it("avec campaignId : pas gestionnaire ⇒ 404", async () => {
    const { ApiError } = await import("@/lib/api-utils");
    requireCampaignManager.mockRejectedValue(new ApiError(404, "Campagne introuvable"));
    const res = await post({ definition: definition("bilan"), campaignId: "cp1" });
    expect(res.status).toBe(404);
    expect(importCampaign).not.toHaveBeenCalled();
  });

  it("sans campaignId : église courante (comportement inchangé)", async () => {
    const res = await post({ definition: definition("nouvelle"), dryRun: true });
    expect(res.status).toBe(200);
    expect(importCampaign).toHaveBeenCalledWith(expect.objectContaining({ churchId: "ch-courante", canCreate: true }));
  });
});
