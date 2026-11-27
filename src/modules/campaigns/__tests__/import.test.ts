import { beforeEach, describe, expect, it, vi } from "vitest";

const model = () => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
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
const notifyRespondentAdded = vi.fn();
vi.mock("../services/notify", () => ({ notifyRespondentAdded: (...a: unknown[]) => notifyRespondentAdded(...a) }));

const { importCampaign, storedDefinition, formDefinitionHash, parseDefinition, definitionCampaignFields } = await import("../services/import");
const { hashJson, dueAtToDate } = await import("../services/values");

const actor = { userId: "u-admin", name: "Admin" };

function definition(items?: unknown[]) {
  return {
    format: "koinonia.campaign",
    version: 1,
    campaign: { key: "bilan", title: "Bilan 2026", dueAt: "2026-12-04" },
    forms: [
      {
        key: "integration",
        title: "Intégration",
        assignments: [{ key: "integration", label: "Intégration", respondents: ["Resp@Exemple.org"] }],
        sections: [
          {
            key: "accueil",
            title: "Accueil",
            items: items ?? [
              { code: "V1", type: "integer", label: "Nouveaux venus", required: true, min: 0 },
              { code: "V2", type: "single", label: "Suivi", choices: [{ key: "oui", label: "Oui" }, { key: "non", label: "Non" }] },
            ],
          },
        ],
      },
    ],
    rules: [{ key: "r1", message: "V1 positif", check: { gte: ["V1", 0] } }],
  };
}

/** État en base correspondant exactement à une définition déjà importée. */
function stored(def: ReturnType<typeof definition>, status = "DRAFT") {
  const parsed = parseDefinition(def);
  const form = parsed.forms[0];
  return {
    id: "c1",
    status,
    definitionHash: hashJson(parsed),
    ...definitionCampaignFields(parsed),
    forms: [
      {
        id: "f1",
        key: form.key,
        title: form.title,
        position: 0,
        confidential: false,
        definition: storedDefinition(form),
        definitionHash: formDefinitionHash(form),
        revision: 1,
        assignments: [{ id: "a1", key: "integration", label: "Intégration", position: 0, dueAt: null, respondents: [{ userId: "u-resp" }] }],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.campaignAnswer.findMany.mockResolvedValue([]);
  db.campaignFile.findMany.mockResolvedValue([]);
  db.campaignAnswer.count.mockResolvedValue(0);
  db.campaignFile.count.mockResolvedValue(0);
  db.user.findMany.mockResolvedValue([{ id: "u-resp", email: "resp@exemple.org", name: "Resp", displayName: null }]);
});

describe("importCampaign", () => {
  it("création : campagne, auteur gestionnaire, questionnaire, destinataire, répondant retrouvé", async () => {
    db.campaign.findUnique.mockResolvedValue(null);
    db.campaign.create.mockResolvedValue({ id: "c-new" });
    db.campaignForm.create.mockResolvedValue({ id: "f-new" });
    db.campaignAssignment.create.mockResolvedValue({ id: "a-new" });
    db.campaignRespondent.create.mockResolvedValue({ id: "r-new" });

    const preview = await importCampaign({ churchId: "ch1", definition: definition(), dryRun: false, actor, canCreate: true });

    expect(preview.campaign).toEqual({ action: "create", key: "bilan", title: "Bilan 2026", fieldsChanged: [] });
    expect(preview.forms[0]).toMatchObject({ key: "integration", action: "create", revision: 1, itemsAdded: ["V1", "V2"] });
    expect(preview.assignments).toEqual([{ formKey: "integration", key: "integration", label: "Intégration", action: "create" }]);
    expect(preview.respondents).toEqual({ resolved: [{ email: "resp@exemple.org", name: "Resp" }], unresolved: [] });
    expect(preview.blocked).toEqual([]);
    expect(preview).toMatchObject({ campaignId: "c-new", applied: true });

    expect(db.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ churchId: "ch1", key: "bilan", createdById: "u-admin", dueAt: dueAtToDate("2026-12-04"), fileRetentionDays: 30 }),
      })
    );
    expect(db.campaignManager.create).toHaveBeenCalledWith({ data: { campaignId: "c-new", userId: "u-admin", addedById: "u-admin" } });
    expect(db.campaignAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ formId: "f-new", campaignId: "c-new", churchId: "ch1", key: "integration" }) })
    );
    expect(db.campaignRespondent.create).toHaveBeenCalledWith(expect.objectContaining({ data: { assignmentId: "a-new", userId: "u-resp", addedById: "u-admin" } }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "Campaign", entityId: "c-new" }));
    // Brouillon : personne n'est prévenu.
    expect(notifyRespondentAdded).not.toHaveBeenCalled();
  });

  it("création refusée sans le droit de gérer les campagnes", async () => {
    db.campaign.findUnique.mockResolvedValue(null);
    await expect(importCampaign({ churchId: "ch1", definition: definition(), dryRun: true, actor, canCreate: false })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("définition invalide : 400 avec la liste des erreurs", async () => {
    const def = definition([
      { code: "V1", type: "integer", label: "A" },
      { code: "V1", type: "integer", label: "B" },
    ]);
    await expect(importCampaign({ churchId: "ch1", definition: def, dryRun: true, actor, canCreate: true })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("V1"),
    });
  });

  it("réimport identique : tout inchangé, rien n'est écrit", async () => {
    const def = definition();
    db.campaign.findUnique.mockResolvedValue(stored(def));
    db.campaignAnswer.findMany.mockResolvedValue([{ assignmentId: "a1", code: "V1", value: 3 }]);

    const preview = await importCampaign({ churchId: "ch1", definition: def, dryRun: false, actor, canCreate: false });

    expect(preview.campaign.action).toBe("unchanged");
    expect(preview.forms.map((f) => f.action)).toEqual(["unchanged"]);
    expect(preview.assignments.map((a) => a.action)).toEqual(["unchanged"]);
    expect(preview.blocked).toEqual([]);
    expect(preview.applied).toBe(true);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("suppression d'un code répondu : bloquée à l'aperçu, refusée (409) à l'application", async () => {
    db.campaign.findUnique.mockResolvedValue(stored(definition()));
    db.campaignAnswer.findMany.mockResolvedValue([{ assignmentId: "a1", code: "V2", value: "oui" }]);
    const without = definition([{ code: "V1", type: "integer", label: "Nouveaux venus", required: true, min: 0 }]);

    const preview = await importCampaign({ churchId: "ch1", definition: without, dryRun: true, actor, canCreate: false });
    expect(preview.forms[0]).toMatchObject({ action: "update", revision: 2, itemsRemoved: ["V2"] });
    expect(preview.blocked).toEqual([{ formKey: "integration", code: "V2", reason: expect.stringContaining("supprimée") }]);

    await expect(importCampaign({ churchId: "ch1", definition: without, dryRun: false, actor, canCreate: false })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("choix retiré alors qu'il est utilisé : bloqué ; choix inutilisé : accepté", async () => {
    db.campaign.findUnique.mockResolvedValue(stored(definition()));
    db.campaignAnswer.findMany.mockResolvedValue([{ assignmentId: "a1", code: "V2", value: "non" }]);
    const items = (keep: string) => [
      { code: "V1", type: "integer", label: "Nouveaux venus", required: true, min: 0 },
      { code: "V2", type: "single", label: "Suivi", choices: [{ key: keep, label: keep }] },
    ];
    const blocked = await importCampaign({ churchId: "ch1", definition: definition(items("oui")), dryRun: true, actor, canCreate: false });
    expect(blocked.blocked).toEqual([{ formKey: "integration", code: "V2", reason: expect.stringContaining("« non »") }]);
    const ok = await importCampaign({ churchId: "ch1", definition: definition(items("non")), dryRun: true, actor, canCreate: false });
    expect(ok.blocked).toEqual([]);
    expect(ok.forms[0].itemsChanged).toEqual(["V2"]);
  });

  it("campagne ouverte : un répondant ajouté est prévenu après la transaction", async () => {
    const def = definition();
    const base = stored(def, "OPEN");
    base.forms[0].assignments[0].respondents = [];
    db.campaign.findUnique.mockResolvedValue(base);
    db.campaignRespondent.create.mockResolvedValue({ id: "r-added" });

    const preview = await importCampaign({ churchId: "ch1", definition: def, dryRun: false, actor, canCreate: false });
    expect(preview.campaign.action).toBe("unchanged");
    expect(db.campaign.update).not.toHaveBeenCalled();
    expect(db.campaignRespondent.create).toHaveBeenCalledWith(expect.objectContaining({ data: { assignmentId: "a1", userId: "u-resp", addedById: "u-admin" } }));
    expect(notifyRespondentAdded).toHaveBeenCalledWith("r-added");
  });

  it("réponse arrivée entre l'aperçu et l'application sur un code retiré : recomptée sous verrou, 409", async () => {
    db.campaign.findUnique.mockResolvedValue(stored(definition()));
    // Aperçu (hors transaction) : aucune réponse ; sous le verrou, une réponse à V2 est arrivée.
    db.campaignAnswer.findMany.mockResolvedValue([]);
    db.campaignAnswer.count.mockResolvedValue(1);
    const without = definition([{ code: "V1", type: "integer", label: "Nouveaux venus", required: true, min: 0 }]);

    await expect(importCampaign({ churchId: "ch1", definition: without, dryRun: false, actor, canCreate: false })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.campaignAnswer.count).toHaveBeenCalledWith({
      where: { OR: [{ assignmentId: { in: ["a1"] }, code: { in: ["V2"] } }] },
    });
    expect(db.campaignForm.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("fichier arrivé entre-temps sur un destinataire supprimé : 409, rien n'est supprimé", async () => {
    const base = stored(definition());
    base.forms[0].assignments.push({ id: "a2", key: "autre", label: "Autre", position: 1, dueAt: null, respondents: [] });
    db.campaign.findUnique.mockResolvedValue(base);
    db.campaignFile.count.mockResolvedValue(1);

    await expect(importCampaign({ churchId: "ch1", definition: definition(), dryRun: false, actor, canCreate: false })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.campaignFile.count).toHaveBeenCalledWith({ where: { OR: [{ assignmentId: { in: ["a2"] } }] } });
    expect(db.campaignAssignment.deleteMany).not.toHaveBeenCalled();
  });
});
