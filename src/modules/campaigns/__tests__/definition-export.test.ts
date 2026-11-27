import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests — définition d'une campagne (spec 091) : export reconstruit depuis la base, aller-retour
 * « inchangé » partout (F9 2026 et document avec messages), omission des confidentiels,
 * réintégration pour l'assistant, duplication.
 */

const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(async () => []),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(async () => 0),
});
const db = {
  campaign: model(),
  campaignManager: model(),
  campaignForm: model(),
  campaignAssignment: model(),
  campaignRespondent: model(),
  campaignAnswer: model(),
  campaignFile: model(),
  user: model(),
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  $queryRaw: vi.fn(async () => []),
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("../services/notify", () => ({ notifyRespondentAdded: vi.fn() }));

const { importCampaign, parseDefinition, storedDefinition, formDefinitionHash, definitionCampaignFields } = await import("../services/import");
const { buildCampaignDefinition, duplicateDefinition, keyFromTitle, mergeHiddenConfidentialRows, exportDueAt, duplicateCampaign } = await import("../services/definition-export");
const { hashJson, dueAtToDate } = await import("../services/values");
type Def = ReturnType<typeof parseDefinition>;

const F9 = JSON.parse(readFileSync(join(process.cwd(), "specs/090-campagnes-collecte/f9-2026.json"), "utf8"));

const WITH_MESSAGES = {
  format: "koinonia.campaign",
  version: 1,
  campaign: {
    key: "bilan",
    title: "Bilan 2026",
    description: "Bilan annuel",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    dueAt: "2026-12-04T18:30:00+01:00",
    fileRetentionDays: 45,
    messages: { initial: "Bonjour {{destinataire}}\n\n{{lien}}", collective: "*{{campagne}}* : {{avancement}}" },
  },
  forms: [
    {
      key: "accueil",
      title: "Accueil",
      intro: "Merci !",
      assignments: [
        { key: "rennes", label: "Rennes", dueAt: "2026-11-30", respondents: ["a@exemple.org"] },
        { key: "brest", label: "Brest" },
      ],
      sections: [
        {
          key: "s1",
          title: "Effectifs",
          items: [
            { code: "N1", type: "integer", label: "Total", required: true, min: 0 },
            { code: "N2", type: "integer", label: "Nouveaux", min: 0 },
          ],
        },
      ],
    },
    {
      key: "secret",
      title: "Protection",
      confidential: true,
      assignments: [{ key: "secret", label: "Référent" }],
      sections: [{ key: "s", title: "S", items: [{ code: "P1", type: "integer", label: "Signalements" }] }],
    },
  ],
  rules: [
    { key: "r1", message: "N2 ≤ N1", check: { lte: ["N2", "N1"] } },
    { key: "r2", message: "P1 positif", check: { gte: ["P1", 0] } },
  ],
};

/** Lignes en base telles que l'import les écrit pour une définition. */
function rowsFor(def: Def) {
  const fields = definitionCampaignFields(def);
  return {
    id: "c1",
    status: "OPEN",
    key: def.campaign.key,
    definitionHash: hashJson(def),
    ...fields,
    forms: def.forms.map((f, position) => ({
      id: `f-${f.key}`,
      key: f.key,
      title: f.title,
      position,
      confidential: f.confidential ?? false,
      definition: storedDefinition(f),
      definitionHash: formDefinitionHash(f),
      revision: 3,
      assignments: f.assignments.map((a, aPos) => ({
        id: `a-${f.key}-${a.key}`,
        key: a.key,
        label: a.label,
        position: aPos,
        dueAt: a.dueAt ? dueAtToDate(a.dueAt) : null,
        respondents: [{ userId: "u1" }],
      })),
    })),
  };
}

async function reimport(rows: ReturnType<typeof rowsFor>, definition: unknown) {
  db.campaign.findUnique.mockResolvedValue(rows);
  return importCampaign({ churchId: "ch1", definition, dryRun: true, actor: { userId: "u", name: "U" }, canCreate: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.campaignAnswer.findMany.mockResolvedValue([]);
  db.campaignFile.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

describe("aller-retour : exportCampaignDefinition puis importCampaign ⇒ inchangé partout", () => {
  for (const [name, doc] of [["F9 2026", F9], ["document avec messages", WITH_MESSAGES]] as const) {
    it(name, async () => {
      const rows = rowsFor(parseDefinition(doc));
      const { definition, omittedForms } = buildCampaignDefinition(rows);
      expect(omittedForms).toBe(0);
      expect(JSON.stringify(definition)).not.toMatch(/respondents|@/);
      const preview = await reimport(rows, definition);
      expect(preview.campaign.action).toBe("unchanged");
      expect(preview.forms.every((f) => f.action === "unchanged")).toBe(true);
      expect(preview.assignments.every((a) => a.action === "unchanged")).toBe(true);
      expect(preview.blocked).toEqual([]);
    });
  }

  it("le document d'origine (répondants compris) est lui aussi « inchangé » côté campagne", async () => {
    const rows = rowsFor(parseDefinition(WITH_MESSAGES));
    expect((await reimport(rows, WITH_MESSAGES)).campaign.action).toBe("unchanged");
    const changed = { ...WITH_MESSAGES, campaign: { ...WITH_MESSAGES.campaign, messages: { initial: "Autre" } } };
    expect((await reimport(rows, changed)).campaign.action).toBe("update");
  });

  it("messages exportés ; échéance jour gardée en jour, instant en ISO", () => {
    const { definition } = buildCampaignDefinition(rowsFor(parseDefinition(WITH_MESSAGES)));
    expect(definition.campaign.messages).toEqual(WITH_MESSAGES.campaign.messages);
    expect(definition.forms[0].assignments[0].dueAt).toBe("2026-11-30");
    expect(definition.campaign.dueAt).toBe(new Date("2026-12-04T18:30:00+01:00").toISOString());
    expect(exportDueAt(dueAtToDate("2026-07-14"))).toBe("2026-07-14");
  });
});

describe("questionnaires confidentiels", () => {
  it("omitConfidential retire le questionnaire et les règles qui le lisent", () => {
    const rows = rowsFor(parseDefinition(WITH_MESSAGES));
    const out = buildCampaignDefinition(rows, { omitConfidential: true });
    expect(out.definition.forms.map((f) => f.key)).toEqual(["accueil"]);
    expect(out.definition.rules?.map((r) => r.key)).toEqual(["r1"]);
    expect(out).toMatchObject({ omittedForms: 1, omittedRules: 1 });
    expect(JSON.stringify(out.definition)).not.toContain("P1");
  });

  it("réintégration : le document de l'assistant retrouve les confidentiels et reste « inchangé »", async () => {
    const rows = rowsFor(parseDefinition(WITH_MESSAGES));
    const { definition } = buildCampaignDefinition(rows, { omitConfidential: true });
    const merged = mergeHiddenConfidentialRows(rows, definition) as Def;
    expect(merged.forms.map((f) => f.key)).toEqual(["accueil", "secret"]);
    expect(merged.rules?.map((r) => r.key)).toEqual(["r1", "r2"]);
    const preview = await reimport(rows, merged);
    expect(preview.forms.every((f) => f.action === "unchanged")).toBe(true);
    expect(preview.assignments.every((a) => a.action === "unchanged")).toBe(true);
  });

  it("refus si l'assistant reprend la clé d'un confidentiel ou d'une règle qui le lit", () => {
    const rows = rowsFor(parseDefinition(WITH_MESSAGES));
    const { definition } = buildCampaignDefinition(rows, { omitConfidential: true });
    expect(() => mergeHiddenConfidentialRows(rows, { ...definition, forms: [...definition.forms, { key: "secret" }] })).toThrow(/questionnaire confidentiel/);
    expect(() => mergeHiddenConfidentialRows(rows, { ...definition, rules: [{ key: "r2" }] })).toThrow(/contrôle/);
  });
});

describe("duplication", () => {
  const source = () => buildCampaignDefinition(rowsFor(parseDefinition(WITH_MESSAGES))).definition;

  it("nouveaux titre, clé et dates ; destinataires gardés sans échéance propre", () => {
    const copy = duplicateDefinition(source(), { title: "Bilan 2027", dueAt: "2027-12-03", periodStart: null }, "bilan-2027-abc");
    expect(copy.campaign).toMatchObject({ key: "bilan-2027-abc", title: "Bilan 2027", dueAt: "2027-12-03", periodEnd: "2026-12-31", messages: WITH_MESSAGES.campaign.messages });
    expect(copy.campaign.periodStart).toBeUndefined();
    expect(copy.forms[0].assignments).toEqual([{ key: "rennes", label: "Rennes" }, { key: "brest", label: "Brest" }]);
    expect(copy.forms[1].confidential).toBe(true);
    expect(copy.rules).toHaveLength(2);
    expect(() => parseDefinition(copy)).not.toThrow();
  });

  it("keepAssignments:false : un destinataire par questionnaire, nommé comme lui", () => {
    const copy = duplicateDefinition(source(), { title: "Copie", keepAssignments: false }, "copie-1");
    expect(copy.forms.map((f) => f.assignments)).toEqual([[{ key: "accueil", label: "Accueil" }], [{ key: "secret", label: "Protection" }]]);
  });

  it("clé lisible, sans accents", () => {
    expect(keyFromTitle("Bilan été 2027 !", "a1b2c3")).toBe("bilan-ete-2027-a1b2c3");
    expect(keyFromTitle("!!!", "x")).toBe("campagne-x");
  });

  it("duplicateCampaign : création par import, clé neuve, rien d'autre copié, journalisé", async () => {
    const rows = rowsFor(parseDefinition(WITH_MESSAGES));
    // 1er appel : chargement de la source ; ensuite : clé libre, puis import (aucune campagne de cette clé).
    db.campaign.findUnique.mockResolvedValueOnce(rows).mockResolvedValue(null);
    db.campaign.create.mockResolvedValue({ id: "c-copy" });
    db.campaignForm.create.mockResolvedValue({ id: "f-copy" });
    db.campaignAssignment.create.mockResolvedValue({ id: "a-copy" });
    const out = await duplicateCampaign("c1", { title: "Bilan 2027" }, { userId: "u-admin", name: "Admin" }, "ch1");
    expect(out).toMatchObject({ campaignId: "c-copy", applied: true, campaign: { action: "create", title: "Bilan 2027" } });
    expect(db.campaign.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ churchId: "ch1", title: "Bilan 2027", messageTemplates: WITH_MESSAGES.campaign.messages }) }));
    expect(db.campaignRespondent.create).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "c-copy", details: { duplicatedFrom: "c1", keepAssignments: true } }));
  });
});
