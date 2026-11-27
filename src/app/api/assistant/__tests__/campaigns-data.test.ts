/**
 * Tests — questions de données des collectes (spec 090, lot 5) : gestionnaire revérifié, église de
 * la connexion, état seulement — jamais une valeur saisie, un nom de fichier ni une adresse ; un
 * questionnaire confidentiel ne montre que son état.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "./viewers";

const db = {
  campaignRespondent: { findMany: vi.fn(async () => [] as unknown[]) },
  campaignForm: { findMany: vi.fn(async () => [{ definition: {} }] as unknown[]) },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));

let isManager = true;
vi.mock("@/modules/campaigns/auth", () => ({ isCampaignManager: vi.fn(async () => isManager) }));

const MANAGED = [
  { id: "cmp-2", churchId: "c1", key: "f9", title: "F9 2026", status: "OPEN", dueAt: new Date("2099-12-04T22:59:00Z"), assignments: { total: 4, submitted: 1, validated: 1 } },
  { id: "cmp-1", churchId: "c1", key: "bilan", title: "Bilan 2025", status: "CLOSED", dueAt: null, assignments: { total: 0, submitted: 0, validated: 0 } },
  { id: "cmp-x", churchId: "c2", key: "autre", title: "Autre église", status: "OPEN", dueAt: null, assignments: { total: 1, submitted: 0, validated: 0 } },
];
const completeness = (missing: string[]) => ({ missing, estimates: ["A2"], toResearch: ["A3"], filesExpected: 2, filesReceived: 1 });
const OVERVIEW = {
  campaign: { id: "cmp-2", churchId: "c1", key: "f9", title: "F9 2026" },
  forms: [
    {
      key: "integration",
      title: "Intégration",
      confidential: false,
      assignments: [
        { id: "a1", label: "Rennes", status: "IN_PROGRESS", dueAt: null, completeness: completeness(["A1"]), files: [{ name: "secret-liste.xlsx" }], respondents: [{ email: "awa@example.org" }] },
      ],
    },
    { key: "pasto", title: "Soins pastoraux", confidential: true, assignments: [{ id: "a2", label: "Brest", status: "SUBMITTED", dueAt: null, completeness: completeness(["P1"]), files: [], respondents: [] }] },
  ],
  progress: { total: 2, byStatus: { NOT_STARTED: 0, IN_PROGRESS: 1, SUBMITTED: 1, CHANGES_REQUESTED: 0, VALIDATED: 0 } },
  checks: [
    { key: "r1", message: "Les nouveaux ne dépassent pas les présents", result: "violated", values: { A1: 4242 }, scope: "local", formKey: "integration", assignmentId: "a1", assignmentLabel: "Rennes" },
    { key: "r2", message: "Règle confidentielle locale", result: "ok", values: { P1: 7 }, scope: "local", formKey: "pasto", assignmentId: "a2", assignmentLabel: "Brest" },
    { key: "r3", message: "Règle croisée sur un code confidentiel", result: "ok", values: { A1: 1, P1: 2 }, scope: "cross", formKey: null, assignmentId: null, assignmentLabel: null },
  ],
};
vi.mock("@/modules/campaigns", () => ({
  listMyCampaigns: vi.fn(async () => ({ managed: MANAGED, assignments: [] })),
  getCampaignOverview: vi.fn(async () => OVERVIEW),
  storedItems: () => [{ code: "P1" }],
  assignmentPath: (id: string) => `/collectes/r/${id}`,
}));

const { CAMPAIGNS_QUESTIONS } = await import("../_data/campaigns");
const q = (key: string) => CAMPAIGNS_QUESTIONS.find((x) => x.key === key)!;
const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", params: {}, viewer: viewerFor("ADMIN") };

beforeEach(() => {
  vi.clearAllMocks();
  isManager = true;
});

describe("campaigns.list", () => {
  it("campagnes gérées de l'église et questionnaires à remplir, avec lien, sans autre église", async () => {
    db.campaignRespondent.findMany.mockResolvedValueOnce([
      { assignment: { id: "a9", label: "Rennes", status: "NOT_STARTED", dueAt: null, form: { title: "Intégration" }, campaign: { title: "F9 2026", status: "OPEN", dueAt: new Date("2099-12-04T22:59:00Z") } } },
    ]);
    const answer = (await q("campaigns.list").run(ctx)) as { items: { label: string; detail?: string; href?: string }[] };
    const text = JSON.stringify(answer);
    expect(text).toContain("clé f9");
    expect(text).toContain("50 % soumis ou validés (2/4)");
    expect(text).not.toContain("Autre église");
    expect(answer.items.find((i) => i.href === "/collectes/r/a9")?.label).toBe("À remplir · Intégration — Rennes");
    expect(db.campaignRespondent.findMany.mock.calls[0]).toEqual([expect.objectContaining({ where: { userId: "user-1", assignment: { campaign: { churchId: "c1", status: { not: "DRAFT" } } } } })]);
  });
});

describe("campaigns.progress", () => {
  it("refus si le compte ne gère pas la campagne, ou campagne inconnue", async () => {
    isManager = false;
    expect(await q("campaigns.progress").run(ctx)).toEqual({ refused: true });
    isManager = true;
    expect(await q("campaigns.progress").run({ ...ctx, params: { campaign: "autre" } })).toEqual({ refused: true });
  });

  it("par défaut la plus récente ouverte ; par clé ou identifiant", async () => {
    const { getCampaignOverview } = await import("@/modules/campaigns");
    await q("campaigns.progress").run(ctx);
    expect(getCampaignOverview).toHaveBeenLastCalledWith("cmp-2");
    await q("campaigns.progress").run({ ...ctx, params: { campaign: "bilan" } });
    expect(getCampaignOverview).toHaveBeenLastCalledWith("cmp-1");
  });

  it("état et compteurs seulement : jamais de valeur, de nom de fichier ni d'adresse ; confidentiel = état", async () => {
    const answer = (await q("campaigns.progress").run(ctx)) as { title: string; items: { label: string; detail?: string }[] };
    const text = JSON.stringify(answer);
    expect(answer.title).toContain("1/2 soumis ou validés");
    expect(answer.items[0]).toEqual({ label: "Intégration — Rennes", detail: "En cours · 1 manquante(s) · 1 estimation(s) · 1 à rechercher · fichiers 1/2 · sans échéance" });
    expect(answer.items[1]).toEqual({ label: "Soins pastoraux — Brest", detail: "Soumis · confidentiel" });
    expect(text).toContain("Contrôle · Les nouveaux ne dépassent pas les présents");
    expect(text).not.toContain("4242");
    expect(text).not.toContain("secret-liste");
    expect(text).not.toContain("@");
    expect(text).not.toContain("Règle confidentielle");
    expect(text).not.toContain("code confidentiel");
  });
});
