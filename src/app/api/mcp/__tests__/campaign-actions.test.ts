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
let confidentialForms: { key: string }[] = [];
const db = {
  campaignForm: { findMany: vi.fn(async () => confidentialForms) },
  campaignAssignment: { findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null) },
  campaign: { findUnique: vi.fn(async () => campaignRow && { id: campaignRow.id, status: campaignRow.status, definitionHash: "h1", updatedAt: campaignRow.updatedAt }), findFirst: vi.fn(async () => campaignRow) },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));

let canManage = true;
let isManager = true;
vi.mock("@/modules/campaigns/auth", () => ({
  hasCampaignsManage: vi.fn(async () => canManage),
  isCampaignManager: vi.fn(async () => isManager),
  isChurchMember: () => true,
  userActor: () => ({ name: "Awa" }),
  getAssignmentAccess: vi.fn(async (): Promise<unknown> => assignmentAccess),
}));
let assignmentAccess: unknown = null;

const PREVIEW = (action: "create" | "update", extra: Record<string, unknown> = {}) => ({
  campaign: { action, key: "bilan", title: "Bilan 2026", fieldsChanged: action === "update" ? ["titre", "échéance"] : [] },
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
  assignmentsWithoutRespondent: vi.fn(async (): Promise<string[]> => []),
  mergeHiddenConfidential: vi.fn(async (_id: string, definition: unknown) => definition),
  exportCampaignDefinition: vi.fn(),
  reopenAssignment: vi.fn(async () => ({ status: "IN_PROGRESS" })),
  missingRespondentsMessage: (missing: string[]) => `Ouverture impossible : ${missing.length} destinataire(s) sans répondant — ${missing.join(" ; ")}.`,
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
  confidentialForms = [];
  assignmentAccess = null;
});

describe("disponibilité", () => {
  it("proposées à campaigns:manage ou au prédicat campaignManager, avec la portée write seulement", () => {
    const names = (v: ReturnType<typeof viewerFor>, write = true) =>
      actionsFor(v, write)
        .map((a) => a.name)
        .filter((n) => n.includes("campaign") || n.includes("contribution"));
    expect(names(viewerFor("ADMIN"))).toEqual([
      "import_campaign_preview",
      "import_campaign_confirm",
      "set_campaign_status_preview",
      "set_campaign_status_confirm",
      "campaign_import_contract",
      "campaign_structure",
      "export_campaign_definition",
      "reopen_contribution_preview",
      "reopen_contribution_confirm",
    ]);
    expect(names(viewerFor("STAR", { predicates: ["campaignManager"] }))).toHaveLength(9);
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
    const updated = await run("import_campaign_preview", { definition: DEF });
    expect(updated.structured.done).toBe(false);
    expect(updated.text).toContain("Champs de la campagne modifiés : titre, échéance");
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
    expect(out.text).toContain("Première ouverture : les répondants des 3 destinataire(s)");
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
    expect((await run("set_campaign_status_preview", { campaign: "cmp-1", op: "open" })).structured.reason).toMatch(/aucun destinataire/);
  });

  it("ouverture refusée tant qu'un destinataire n'a aucun répondant valide (aperçu), sans jeton", async () => {
    campaignRow = row("DRAFT");
    svc.assignmentsWithoutRespondent.mockResolvedValueOnce(["Intégration › Rennes", "Compta › Compta"]);
    mcp.createConfirmation.mockClear();
    const out = await run("set_campaign_status_preview", { campaign: "cmp-1", op: "open" });
    expect(svc.assignmentsWithoutRespondent).toHaveBeenCalledWith("cmp-1", "c1");
    expect(out.structured.reason).toMatch(/2 destinataire\(s\) sans répondant — Intégration › Rennes ; Compta › Compta/);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
    // La clôture n'est pas concernée.
    campaignRow = row("OPEN");
    svc.assignmentsWithoutRespondent.mockClear();
    await run("set_campaign_status_preview", { campaign: "cmp-1", op: "close" });
    expect(svc.assignmentsWithoutRespondent).not.toHaveBeenCalled();
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

describe("spec 091 : questionnaires confidentiels à l'import", () => {
  it("campagne existante : confidentiels réintégrés d'office, absents du résumé, définition fusionnée appliquée", async () => {
    campaignRow = { id: "cmp-1", status: "OPEN", updatedAt: new Date(0) };
    confidentialForms = [{ key: "pastoral" }];
    const merged = { ...DEF, forms: [{ key: "pastoral" }] };
    svc.mergeHiddenConfidential.mockImplementation(async () => merged);
    previewResult = PREVIEW("update", {
      forms: [
        { key: "integration", title: "Intégration", action: "update", revision: 2, itemsAdded: [], itemsChanged: ["N1"], itemsRemoved: [] },
        { key: "pastoral", title: "Suivi pastoral secret", action: "unchanged", revision: 1, itemsAdded: [], itemsChanged: [], itemsRemoved: [] },
      ],
      assignments: [
        { formKey: "integration", key: "rennes", label: "Rennes", action: "update" },
        { formKey: "pastoral", key: "p", label: "Pasteur", action: "unchanged" },
      ],
    });
    const out = await run("import_campaign_preview", { definition: DEF });
    expect(svc.mergeHiddenConfidential).toHaveBeenCalledWith("cmp-1", DEF);
    expect(svc.importCampaign).toHaveBeenCalledWith(expect.objectContaining({ definition: merged, dryRun: true }));
    expect(JSON.stringify(out)).not.toContain("pastoral");
    expect(JSON.stringify(out)).not.toContain("Suivi pastoral");
    await run("import_campaign_confirm", { confirmation: lastToken });
    expect(svc.importCampaign).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false, definition: merged }));
    svc.mergeHiddenConfidential.mockImplementation(async (_id: string, d: unknown) => d);
  });

  it("clé d'un questionnaire confidentiel reprise : refus lisible, sans jeton", async () => {
    campaignRow = { id: "cmp-1", status: "DRAFT", updatedAt: new Date(0) };
    svc.mergeHiddenConfidential.mockRejectedValueOnce(new ApiError(400, "Ce document reprend la clé d'un questionnaire confidentiel"));
    const out = await run("import_campaign_preview", { definition: DEF });
    expect(out.structured.reason).toMatch(/questionnaire confidentiel/);
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });
});

describe("spec 091 : lectures", () => {
  it("campaign_import_contract : schéma JSON, types, exemple minimal valide", async () => {
    const { campaignDefinitionSchema, validateDefinition } = await vi.importActual<typeof import("@/modules/campaigns/schemas")>("@/modules/campaigns/schemas");
    const out = await run("campaign_import_contract", {});
    const c = out.structured as { jsonSchema: unknown; itemTypes: unknown[]; example: unknown; messages: { placeholders: unknown[] } };
    expect(c.jsonSchema).toBeTruthy();
    expect(c.itemTypes.length).toBeGreaterThan(5);
    expect(c.messages.placeholders.length).toBeGreaterThan(5);
    const parsed = campaignDefinitionSchema.parse(c.example);
    expect(validateDefinition(parsed)).toEqual([]);
  });

  it("campaign_structure : questions des questionnaires non confidentiels seulement", async () => {
    campaignRow = { id: "cmp-1", churchId: "c1", key: "bilan", title: "Bilan 2026", status: "OPEN", updatedAt: new Date(0), _count: { assignments: 2 } };
    const section = { key: "s", title: "S", items: [{ code: "SECRET_N", type: "integer", label: "Question secrète" }] };
    db.campaign.findUnique.mockResolvedValueOnce({
      dueAt: null,
      forms: [
        { key: "pub", title: "Public", confidential: false, revision: 1, definition: { sections: [{ ...section, items: [{ code: "N1", type: "integer", label: "Effectif" }] }] }, assignments: [{ id: "a1", key: "a1", label: "Rennes", status: "SUBMITTED", dueAt: null }] },
        { key: "conf", title: "Confidentiel", confidential: true, revision: 1, definition: { sections: [section] }, assignments: [{ id: "a2", key: "a2", label: "Pasteur", status: "NOT_STARTED", dueAt: null }] },
      ],
    } as never);
    const out = await run("campaign_structure", { campaign: "bilan" });
    const json = JSON.stringify(out);
    expect(json).toContain("N1");
    expect(json).not.toContain("SECRET_N");
    expect(json).not.toContain("Question secrète");
    expect(json).toContain("a2");
  });

  it("export_campaign_definition : toujours sans les confidentiels, omission annoncée", async () => {
    campaignRow = { id: "cmp-1", churchId: "c1", key: "bilan", title: "Bilan 2026", status: "DRAFT", updatedAt: new Date(0), _count: { assignments: 1 } };
    svc.exportCampaignDefinition.mockResolvedValueOnce({ definition: DEF, omittedForms: 1, omittedRules: 2 } as never);
    const out = await run("export_campaign_definition", { campaign: "bilan" });
    expect(svc.exportCampaignDefinition).toHaveBeenCalledWith("cmp-1", { omitConfidential: true });
    expect(out.text).toMatch(/1 questionnaire\(s\) confidentiel\(s\) et 2 contrôle\(s\)/);
    isManager = false;
    expect((await run("export_campaign_definition", { campaign: "bilan" })).structured.reason).toMatch(/introuvable/);
  });
});

describe("spec 091 : rouvrir une contribution", () => {
  const row = (status: string, campaignStatus = "OPEN") => ({
    label: "Rennes",
    status,
    submittedAt: new Date(0),
    reviewedAt: null,
    form: { title: "Intégration" },
    campaign: { id: "cmp-1", title: "Bilan 2026", status: campaignStatus },
  });
  const manager = { role: "manager", actor: { kind: "user", userId: "user-1", name: "Awa" }, assignment: { id: "a1", churchId: "c1" } };

  it("aperçu puis confirmation : soumis → en cours, via l'assistant IA", async () => {
    assignmentAccess = manager;
    db.campaignAssignment.findUnique.mockResolvedValue(row("SUBMITTED"));
    const out = await run("reopen_contribution_preview", { assignment: "a1", reason: "Chiffre 2025 à revoir" });
    expect(out.text).toContain("« Soumis » → « En cours »");
    expect(JSON.stringify(out)).not.toContain("Chiffre 2025");
    const done = await run("reopen_contribution_confirm", { confirmation: lastToken });
    expect(done.structured).toMatchObject({ done: true, status: "IN_PROGRESS" });
    expect(svc.reopenAssignment).toHaveBeenCalledWith(manager, "Chiffre 2025 à revoir");
    expect(auditContexts).toEqual([{ via: "mcp" }]);
  });

  it("refus : non gestionnaire, autre église, non soumise, campagne fermée, état changé", async () => {
    db.campaignAssignment.findUnique.mockResolvedValue(row("SUBMITTED"));
    expect((await run("reopen_contribution_preview", { assignment: "a1" })).structured.reason).toMatch(/introuvable/);
    assignmentAccess = { ...manager, assignment: { id: "a1", churchId: "autre" } };
    expect((await run("reopen_contribution_preview", { assignment: "a1" })).structured.reason).toMatch(/introuvable/);
    assignmentAccess = manager;
    db.campaignAssignment.findUnique.mockResolvedValue(row("VALIDATED"));
    expect((await run("reopen_contribution_preview", { assignment: "a1" })).structured.reason).toMatch(/annulez d'abord la validation/);
    db.campaignAssignment.findUnique.mockResolvedValue(row("SUBMITTED", "CLOSED"));
    expect((await run("reopen_contribution_preview", { assignment: "a1" })).structured.reason).toMatch(/pas ouverte/);
    db.campaignAssignment.findUnique.mockResolvedValue(row("SUBMITTED"));
    await run("reopen_contribution_preview", { assignment: "a1" });
    db.campaignAssignment.findUnique.mockResolvedValue({ ...row("SUBMITTED"), reviewedAt: new Date(5) });
    expect((await run("reopen_contribution_confirm", { confirmation: lastToken })).structured.reason).toMatch(/ont changé/);
    expect(svc.reopenAssignment).not.toHaveBeenCalled();
  });
});
