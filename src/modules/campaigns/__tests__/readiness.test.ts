/**
 * Tests — pilotage (spec 091) : « Préparer l'ouverture » (`campaignReadiness`), questions
 * concernées et caractère exploitable (`assignmentIssues`), modèles de messages des paramètres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  campaign: { findUnique: vi.fn(), update: vi.fn() },
  campaignAssignment: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
vi.mock("../services/notify", () => ({ notifyCampaignOpened: vi.fn(), notifyRespondentAdded: vi.fn() }));

const { campaignReadiness, assignmentIssues, updateCampaignSettings } = await import("../services/campaigns");
const { Prisma } = await import("@/generated/prisma/client");

const SECTIONS = [{ key: "s", title: "S", items: [{ code: "N1", type: "integer", label: "Total" }, { code: "N2", type: "integer", label: "Nouveaux" }] }];
const now = new Date("2026-11-20T10:00:00Z");

function campaign(extra: Record<string, unknown> = {}) {
  return {
    churchId: "ch1",
    key: "bilan",
    title: "Bilan",
    description: null,
    periodStart: null,
    periodEnd: null,
    dueAt: new Date("2026-12-04T22:59:00Z"),
    fileRetentionDays: 30,
    messageTemplates: null,
    rules: [{ key: "r1", message: "N2 ≤ N1", check: { lte: ["N2", "N1"] } }],
    forms: [
      { key: "acc", title: "Accueil", position: 0, confidential: false, definition: { sections: SECTIONS }, assignments: [{ key: "a", label: "Rennes", position: 0, dueAt: null }] },
      { key: "prot", title: "Protection", position: 1, confidential: true, definition: { sections: [{ key: "p", title: "P", items: [{ code: "P1", type: "integer", label: "P" }] }] }, assignments: [{ key: "p", label: "Référent", position: 0, dueAt: new Date("2026-11-01T22:59:00Z") }] },
    ],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue(campaign());
  db.campaignAssignment.findMany.mockResolvedValue([]);
});

describe("campaignReadiness", () => {
  it("synthèse : échéance dépassée et répondants manquants signalés, confidentiel informatif, aucun nom", async () => {
    db.campaignAssignment.findMany.mockResolvedValue([{ label: "Rennes", form: { title: "Accueil" } }]);
    const r = await campaignReadiness("cp1", now);
    const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
    expect(r.items.map((i) => i.key)).toEqual(["forms", "questions", "definition", "dueDates", "assignments", "respondents", "rules", "confidential"]);
    expect(r.ready).toBe(false);
    expect(by.forms.ok && by.questions.ok && by.definition.ok && by.assignments.ok && by.rules.ok).toBe(true);
    expect(by.dueDates).toMatchObject({ ok: false, detail: expect.stringContaining("Protection › Référent") });
    expect(by.respondents).toMatchObject({ ok: false, detail: expect.stringContaining("Accueil › Rennes") });
    expect(by.confidential).toMatchObject({ ok: true, detail: expect.stringContaining("1 questionnaire(s) confidentiel(s)") });
  });

  it("tout est prêt ; définition invalide (règle sur un code inconnu) signalée", async () => {
    db.campaign.findUnique.mockResolvedValue(campaign({ forms: [campaign().forms[0]] }));
    expect((await campaignReadiness("cp1", now)).ready).toBe(true);
    db.campaign.findUnique.mockResolvedValue(campaign({ forms: [campaign().forms[0]], rules: [{ key: "r1", message: "x", check: { gte: ["ZZ", 0] } }] }));
    const r = await campaignReadiness("cp1", now);
    expect(r.items.find((i) => i.key === "definition")).toMatchObject({ ok: false, detail: expect.stringMatching(/ZZ/) });
    expect(r.items.find((i) => i.key === "rules")?.ok).toBe(false);
  });

  it("aucun questionnaire : non prête", async () => {
    db.campaign.findUnique.mockResolvedValue(campaign({ forms: [], rules: null }));
    const r = await campaignReadiness("cp1", now);
    expect(r.ready).toBe(false);
    expect(r.items.find((i) => i.key === "forms")?.ok).toBe(false);
  });
});

describe("assignmentIssues", () => {
  const items = SECTIONS[0].items as never;
  const c = (extra = {}) => ({ missing: [], estimates: [], toResearch: [], filesExpected: 0, filesReceived: 0, ...extra });

  it("soumise sans réserve : exploitable ; estimation seule : exploitable aussi", () => {
    expect(assignmentIssues(items, c(), [], [], "SUBMITTED")).toEqual({ issues: [], exploitable: true });
    const r = assignmentIssues(items, c({ estimates: ["N2"] }), [], [], "VALIDATED");
    expect(r).toEqual({ issues: [{ code: "N2", label: "Nouveaux", kind: "estimate" }], exploitable: true });
  });

  it("à rechercher, manquante, fichier attendu ou contrôle non respecté : non exploitable ; non soumise : jamais", () => {
    expect(assignmentIssues(items, c({ toResearch: ["N1"] }), [], [], "SUBMITTED").exploitable).toBe(false);
    const r = assignmentIssues(items, c({ missing: ["N1", "F"] }), ["F"], [{ key: "r1", message: "N2 ≤ N1" }], "SUBMITTED");
    expect(r.issues.map((i) => i.kind)).toEqual(["missing", "file_pending", "check"]);
    expect(r.issues[2]).toEqual({ code: "r1", label: "N2 ≤ N1", kind: "check" });
    expect(assignmentIssues(items, c(), [], [], "IN_PROGRESS").exploitable).toBe(false);
  });

  it("une demande de fichier « à rechercher » n'est listée qu'une fois, comme fichier attendu", () => {
    const r = assignmentIssues(items, c({ toResearch: ["F", "N1"] }), ["F"], [], "SUBMITTED");
    expect(r.issues.map((i) => [i.code, i.kind])).toEqual([
      ["F", "file_pending"],
      ["N1", "to_research"],
    ]);
    expect(r.exploitable).toBe(false);
  });
});

describe("paramètres : modèles de messages", () => {
  beforeEach(() => {
    db.campaign.findUnique.mockResolvedValue({ churchId: "ch1", periodStart: null, periodEnd: null });
    db.campaign.update.mockImplementation(async ({ data }: { data: { messageTemplates?: unknown } }) => ({ id: "cp1", messageTemplates: data.messageTemplates === Prisma.DbNull ? null : data.messageTemplates }));
  });

  it("l'objet remplace les modèles ; vide ou null rétablit les textes par défaut", async () => {
    const out = await updateCampaignSettings("cp1", { messageTemplates: { initial: "Bonjour {{destinataire}}" } }, { userId: "u1", name: "A" });
    expect(db.campaign.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { messageTemplates: { initial: "Bonjour {{destinataire}}" } } }));
    expect(out.messageTemplates).toEqual({ initial: "Bonjour {{destinataire}}" });
    await updateCampaignSettings("cp1", { messageTemplates: {} }, { userId: "u1", name: "A" });
    expect(db.campaign.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { messageTemplates: Prisma.DbNull } }));
    expect((await updateCampaignSettings("cp1", { messageTemplates: null }, { userId: "u1", name: "A" })).messageTemplates).toEqual({});
  });
});
