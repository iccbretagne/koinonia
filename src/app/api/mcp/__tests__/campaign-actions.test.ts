/**
 * Tests — actions MCP des campagnes de collecte (spec 090, lot 5) : import en aperçu puis
 * confirmation (droits de la route, empreinte, jamais d'adresse), changement d'état (gestionnaire,
 * transitions), journal « via l'assistant IA ».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "../../assistant/__tests__/viewers";
import { ApiError } from "@/lib/api-utils";

let stored: Record<string, unknown> = {};
let lastToken = "";
const mcp = {
  createConfirmation: vi.fn(async (_g: string, _a: string, payload: unknown) => {
    lastToken = `kmx_tok_${Object.keys(stored).length + 1}`;
    stored[lastToken] = payload;
    return { token: lastToken, expiresAt: new Date("2099-01-01T00:05:00Z") };
  }),
  consumeConfirmation: vi.fn(async (_g: string, _a: string, token: string) => {
    const p = stored[token] ?? null;
    delete stored[token];
    return p;
  }),
  publicOrigin: () => "https://koinonia.test",
};
vi.mock("@/modules/mcp", () => mcp);
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const auditContexts: unknown[] = [];
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  withAuditContext: async (extra: unknown, fn: () => Promise<unknown>) => {
    auditContexts.push(extra);
    return fn();
  },
}));

let campaignRow: Record<string, unknown> | null = null;
const db = { campaign: { findUnique: vi.fn(async () => campaignRow && { id: campaignRow.id, status: campaignRow.status, definitionHash: "h1", updatedAt: campaignRow.updatedAt }), findFirst: vi.fn(async () => campaignRow) } };
vi.mock("@/lib/prisma", () => ({ prisma: db }));

let canManage = true;
let isManager = true;
vi.mock("@/modules/campaigns/auth", () => ({
  hasCampaignsManage: vi.fn(async () => canManage),
  isCampaignManager: vi.fn(async () => isManager),
  isChurchMember: () => true,
  userActor: () => ({ name: "Awa" }),
}));

const PREVIEW = (action: "create" | "update", extra: Record<string, unknown> = {}) => ({
  campaign: { action, key: "bilan", title: "Bilan 2026" },
  forms: [{ key: "integration", title: "Intégration", action: "create", revision: 1, itemsAdded: ["N1", "N2"], itemsChanged: [], itemsRemoved: [] }],
  assignments: [{ formKey: "integration", key: "rennes", label: "Rennes", action: "create" }],
  respondents: { resolved: [{ email: "awa@example.org", name: "Awa" }], unresolved: ["inconnu@example.org"] },
  blocked: [],
  definitionHash: "h2",
  campaignId: action === "create" ? null : "cmp-1",
  applied: false,
  ...extra,
});
let previewResult: ReturnType<typeof PREVIEW> = PREVIEW("create");
const svc = {
  findCampaignByKey: vi.fn(async () => (campaignRow ? { id: campaignRow.id, churchId: "c1", status: campaignRow.status, title: "Bilan 2026" } : null)),
  importCampaign: vi.fn(async (input: { dryRun: boolean }) => (input.dryRun ? previewResult : { ...previewResult, campaignId: "cmp-1", applied: true })),
  changeCampaignStatus: vi.fn(async (_id: string, op: string) => ({ id: "cmp-1", status: op === "close" ? "CLOSED" : "OPEN" })),
};
vi.mock("@/modules/campaigns", () => svc);

const { CAMPAIGN_ACTIONS } = await import("../_actions/campaigns");
const { MCP_ACTIONS, actionsFor } = await import("../_actions");
const A = (name: string) => CAMPAIGN_ACTIONS.find((a) => a.name === name)!;
const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", viewer: viewerFor("ADMIN"), grantId: "g1" };
const run = (name: string, input: unknown) => A(name).run(input as never, ctx);
const DEF = { format: "koinonia.campaign", version: 1, campaign: { key: "bilan", title: "Bilan 2026" }, forms: [] };

beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  lastToken = "";
  auditContexts.length = 0;
  canManage = true;
  isManager = true;
  campaignRow = null;
  previewResult = PREVIEW("create");
});

describe("disponibilité", () => {
  it("proposées à campaigns:manage ou au prédicat campaignManager, avec la portée write seulement", () => {
    const names = (v: ReturnType<typeof viewerFor>, write = true) => actionsFor(v, write).map((a) => a.name).filter((n) => n.includes("campaign"));
    expect(names(viewerFor("ADMIN"))).toEqual(["import_campaign_preview", "import_campaign_confirm", "set_campaign_status_preview", "set_campaign_status_confirm"]);
    expect(names(viewerFor("STAR", { predicates: ["campaignManager"] }))).toHaveLength(4);
    expect(names(viewerFor("SECRETARY"))).toEqual([]);
    expect(names(viewerFor("ADMIN"), false)).toEqual([]);
    expect(names(viewerFor("ADMIN", { modules: ["core"] }))).toEqual([]);
    expect(MCP_ACTIONS.filter((a) => a.action === "import_campaign")).toHaveLength(2);
  });
});

describe("import d'une définition", () => {
  it("aperçu : dryRun, résumé sans aucune adresse, jeton", async () => {
    const out = await run("import_campaign_preview", { definition: DEF });
    expect(svc.importCampaign).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", dryRun: true, canCreate: true }));
    expect(out.text).toContain("Créer la campagne « Bilan 2026 » (clé bilan) en brouillon");
    expect(out.text).toContain("1 compte(s) de l'église retrouvé(s), 1 adresse(s) sans compte");
    expect(JSON.stringify(out)).not.toContain("@");
    expect(out.structured).toMatchObject({ done: false, confirmation: lastToken });
  });

  it("création réservée à campaigns:manage ; réimport réservé aux gestionnaires (sinon introuvable)", async () => {
    canManage = false;
    expect((await run("import_campaign_preview", { definition: DEF })).structured.reason).toMatch(/campaigns:manage/);
    campaignRow = { id: "cmp-1", status: "DRAFT", updatedAt: new Date(0) };
    isManager = false;
    expect((await run("import_campaign_preview", { definition: DEF })).structured.reason).toMatch(/introuvable/);
    isManager = true;
    previewResult = PREVIEW("update");
    expect((await run("import_campaign_preview", { definition: DEF })).structured.done).toBe(false);
    expect(svc.importCampaign).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, canCreate: false }));
  });

  it("définition invalide ou modification bloquante : refus sans jeton", async () => {
    svc.importCampaign.mockRejectedValueOnce(new ApiError(400, "Définition invalide : forms : requis"));
    expect((await run("import_campaign_preview", { definition: {} })).structured.reason).toMatch(/Définition invalide/);
    previewResult = PREVIEW("update", { blocked: [{ formKey: "integration", code: "N1", reason: "Question supprimée alors qu'elle a des réponses" }] });
    const out = await run("import_campaign_preview", { definition: DEF });
    expect(out.structured.reason).toMatch(/integration.N1 : Question supprimée/);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("confirmation : réapplique avec dryRun:false, via l'assistant IA, jeton à usage unique et effacé", async () => {
    await run("import_campaign_preview", { definition: DEF });
    const token = lastToken;
    const out = await run("import_campaign_confirm", { confirmation: token });
    expect(out.structured).toMatchObject({ done: true, campaignId: "cmp-1", link: "https://koinonia.test/collectes/cmp-1" });
    expect(svc.importCampaign).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false, definition: DEF }));
    expect(auditContexts).toEqual([{ via: "mcp" }]);
    expect(mcp.consumeConfirmation).toHaveBeenCalledWith("g1", "import_campaign", token, expect.any(Date), { erase: true });
    expect((await run("import_campaign_confirm", { confirmation: token })).structured.reason).toMatch(/expirée/);
  });

  it("confirmation refusée si la campagne a changé depuis l'aperçu ou si le droit a disparu", async () => {
    await run("import_campaign_preview", { definition: DEF });
    campaignRow = { id: "cmp-1", status: "DRAFT", updatedAt: new Date(0) };
    expect((await run("import_campaign_confirm", { confirmation: lastToken })).structured.reason).toMatch(/ont changé/);
    campaignRow = null;
    await run("import_campaign_preview", { definition: DEF });
    canManage = false;
    expect((await run("import_campaign_confirm", { confirmation: lastToken })).structured.reason).toMatch(/campaigns:manage/);
    expect(svc.importCampaign).not.toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });
});

describe("état d'une campagne", () => {
  const row = (status: string, extra: Record<string, unknown> = {}) => ({ id: "cmp-1", churchId: "c1", key: "bilan", title: "Bilan 2026", status, openedAt: null, updatedAt: new Date(0), _count: { assignments: 3 }, ...extra });

  it("ouverture : gestionnaire, campagne de l'église (par clé), première ouverture annoncée", async () => {
    campaignRow = row("DRAFT");
    const out = await run("set_campaign_status_preview", { campaign: "bilan", op: "open" });
    expect(db.campaign.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "c1", OR: [{ id: "bilan" }, { key: "bilan" }] } }));
    expect(out.text).toContain("« Brouillon » → « Ouverte »");
    expect(out.text).toContain("Première ouverture");
    const done = await run("set_campaign_status_confirm", { confirmation: lastToken });
    expect(done.structured).toMatchObject({ done: true, status: "OPEN" });
    expect(svc.changeCampaignStatus).toHaveBeenCalledWith("cmp-1", "open", { userId: "user-1", name: "Awa" });
    expect(auditContexts).toEqual([{ via: "mcp" }]);
  });

  it("non gestionnaire, autre église ou transition impossible : refus", async () => {
    campaignRow = row("DRAFT");
    isManager = false;
    expect((await run("set_campaign_status_preview", { campaign: "cmp-1", op: "open" })).structured.reason).toMatch(/introuvable/);
    isManager = true;
    campaignRow = null;
    expect((await run("set_campaign_status_preview", { campaign: "cmp-1", op: "open" })).structured.reason).toMatch(/introuvable/);
    campaignRow = row("DRAFT");
    expect((await run("set_campaign_status_preview", { campaign: "cmp-1", op: "close" })).structured.reason).toMatch(/Impossible/);
    campaignRow = row("DRAFT", { _count: { assignments: 0 } });
    expect((await run("set_campaign_status_preview", { campaign: "cmp-1", op: "open" })).structured.reason).toMatch(/aucun questionnaire/);
  });

  it("confirmation refusée si l'état a changé ; erreur du service rendue lisible", async () => {
    campaignRow = row("OPEN");
    await run("set_campaign_status_preview", { campaign: "cmp-1", op: "close" });
    campaignRow = row("CLOSED");
    expect((await run("set_campaign_status_confirm", { confirmation: lastToken })).structured.reason).toMatch(/ont changé/);
    campaignRow = row("OPEN");
    await run("set_campaign_status_preview", { campaign: "cmp-1", op: "close" });
    svc.changeCampaignStatus.mockRejectedValueOnce(new ApiError(409, "La campagne a changé entre-temps : rechargez la page"));
    expect((await run("set_campaign_status_confirm", { confirmation: lastToken })).structured.reason).toMatch(/Rien n'est fait/);
  });
});
