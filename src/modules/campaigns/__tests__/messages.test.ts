import { describe, expect, it } from "vitest";
import {
  COLLECTIVE_MESSAGE_KINDS,
  DEFAULT_MESSAGE_TEMPLATES,
  MESSAGE_KINDS,
  MESSAGE_PLACEHOLDERS,
  composeMessage,
  messageTemplatesSchema,
  previewAssignmentView,
  progressCounts,
  renderTemplate,
  validateDefinition,
  type MessageContext,
} from "../schemas";

/** Tests — messages de communication (spec 091) : purs, réexportés par `schemas`. */

const now = new Date("2026-11-20T10:00:00Z");
const ctx = (extra: Partial<MessageContext> = {}): MessageContext => ({
  churchName: "ICC Rennes",
  campaignTitle: "Bilan F9 2026",
  campaignDueAt: "2026-12-04",
  appUrl: "https://koinonia.test/",
  now,
  contributions: [
    { id: "a1", formTitle: "Secrétariat", confidential: false, label: "Secrétariat", status: "SUBMITTED", dueAt: "2026-12-04", link: "https://koinonia.test/collectes/questionnaire/a1" },
    { id: "a2", formTitle: "Accueil", confidential: false, label: "Accueil", status: "NOT_STARTED", dueAt: "2026-11-15", link: "https://koinonia.test/collecte/kc_perso" },
    { id: "a3", formTitle: "EJP", confidential: false, label: "EJP", status: "CHANGES_REQUESTED", dueAt: null },
    { id: "a4", formTitle: "Protection", confidential: true, label: "Protection", status: "IN_PROGRESS", dueAt: "2026-11-10", link: "https://koinonia.test/collecte/kc_secret" },
    { id: "a5", formTitle: "Pasteure", confidential: false, label: "Pasteure", status: "VALIDATED", dueAt: "2026-12-04" },
  ],
  ...extra,
});

describe("modèles", () => {
  it("un texte par défaut pour chaque type, au format WhatsApp, sans HTML", () => {
    for (const kind of MESSAGE_KINDS) {
      expect(DEFAULT_MESSAGE_TEMPLATES[kind].length).toBeGreaterThan(20);
      expect(DEFAULT_MESSAGE_TEMPLATES[kind]).not.toMatch(/<[a-z]/i);
    }
    expect(DEFAULT_MESSAGE_TEMPLATES.initial).toContain("nous sollicitons ta contribution pour {{destinataire}}");
    expect(DEFAULT_MESSAGE_TEMPLATES.initial).toContain("La Coordination générale");
  });

  it("chaque variable des modèles par défaut est documentée", () => {
    const known = new Set(MESSAGE_PLACEHOLDERS.map((p) => p.key));
    for (const t of Object.values(DEFAULT_MESSAGE_TEMPLATES)) {
      for (const [, name] of t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) expect(known.has(name)).toBe(true);
    }
  });

  it("schéma : clés connues seulement, texte non vide", () => {
    expect(messageTemplatesSchema.safeParse({ initial: "Bonjour" }).success).toBe(true);
    expect(messageTemplatesSchema.safeParse({ autre: "x" }).success).toBe(false);
    expect(messageTemplatesSchema.safeParse({ initial: "  " }).success).toBe(false);
  });

  it("renderTemplate : variable inconnue ou vide laissée vide, lignes resserrées", () => {
    expect(renderTemplate("A {{x}} B {{ inconnu }}\n\n\n\n{{vide}}\n\nC", { x: 1, vide: "" })).toBe("A 1 B\n\nC");
  });
});

describe("composeMessage — collectif", () => {
  it("point d'avancement : taux par contribution, confidentiels exclus et ligne de périmètre, lien générique seul", () => {
    const r = composeMessage("progress", ctx(), { showDone: true, detail: "full" });
    expect(r.collective).toBe(true);
    expect(r.counts).toMatchObject({ total: 4, done: 2, remaining: 2, overdue: 1 });
    expect(r.excludedConfidential).toBe(1);
    const text = r.messages[0].text;
    expect(text).toContain("*2/4* contributions transmises (*50 %*)");
    expect(text).toContain("Ont répondu");
    expect(text).toContain("1 contribution(s) confidentielle(s) non comptée(s)");
    expect(text).toContain("https://koinonia.test/collectes");
    expect(text).not.toMatch(/collecte\/kc_|questionnaire\/a1|Protection/);
  });

  it("confidentiels inclus sur demande ; modèle personnalisé sans {{perimetre}} : périmètre ajouté quand même", () => {
    expect(composeMessage("progress", ctx(), { includeConfidential: true }).counts.total).toBe(5);
    const r = composeMessage("collective", ctx(), { template: "Il reste {{restantes}}." });
    expect(r.messages[0].text).toBe("Il reste 2.\n\n_1 contribution(s) confidentielle(s) non comptée(s)._");
  });

  it("relance collective : liste les restantes, niveau court", () => {
    const text = composeMessage("collective", ctx()).messages[0].text;
    expect(text).toContain("• Accueil");
    expect(text).toContain("• EJP");
    expect(text).not.toContain("• Secrétariat");
  });

  it("COLLECTIVE_MESSAGE_KINDS", () => expect([...COLLECTIVE_MESSAGE_KINDS]).toEqual(["launch", "progress", "collective", "closing"]));
});

describe("composeMessage — individuel", () => {
  it("relance individuelle : non transmises, hors confidentiels, lien personnel ou générique", () => {
    const r = composeMessage("individual", ctx());
    expect(r.messages.map((m) => m.contribution?.id)).toEqual(["a2", "a3"]);
    expect(r.messages[0].text).toContain("https://koinonia.test/collecte/kc_perso");
    expect(r.messages[1].text).toContain("https://koinonia.test/collectes");
    expect(r.messages[1].text).toContain("4 décembre 2026");
  });

  it("échéance dépassée : seulement les retards ; contributions précises (confidentielle comprise)", () => {
    expect(composeMessage("overdue", ctx()).messages.map((m) => m.contribution?.id)).toEqual(["a2"]);
    expect(composeMessage("individual", ctx(), { contributionIds: ["a4"] }).messages.map((m) => m.contribution?.id)).toEqual(["a4"]);
  });

  it("demande initiale : texte d'exemple rempli", () => {
    const text = composeMessage("initial", ctx(), { contributionIds: ["a2"] }).messages[0].text;
    expect(text).toBe(
      "Bonjour,\n\nDans le cadre du Bilan F9 2026 de ICC Rennes, nous sollicitons ta contribution pour Accueil.\n\nMerci de compléter le questionnaire au plus tard le dimanche 15 novembre 2026.\n\n👉 Accéder au questionnaire :\nhttps://koinonia.test/collecte/kc_perso\n\nMerci pour ta disponibilité et ta contribution.\n\nSois béni(e) !\nLa Coordination générale"
    );
  });

  it("nouvelle soumission : en cours et correction demandée", () => {
    expect(composeMessage("resubmission", ctx()).messages.map((m) => m.contribution?.id)).toEqual(["a3"]);
  });

  it("progressCounts : un jour d'échéance vaut toute la journée à Paris", () => {
    const c = progressCounts([{ status: "NOT_STARTED", dueAt: "2026-11-20" }], new Date("2026-11-20T22:00:00Z"));
    expect(c.overdue).toBe(0);
    expect(progressCounts([{ status: "NOT_STARTED", dueAt: "2026-11-20" }], new Date("2026-11-20T23:30:00Z")).overdue).toBe(1);
  });
});

describe("aperçu répondant (previewAssignmentView)", () => {
  const sections = [
    { key: "s", title: "S", items: [{ code: "N1", type: "integer" as const, label: "Total", required: true }, { code: "N2", type: "integer" as const, label: "Autre" }] },
  ];

  it("vue vide, saisie permise, complétude sur aucune réponse, échéance jour à Paris", () => {
    const v = previewAssignmentView({ title: "Bilan", dueAt: "2026-12-04" }, { key: "acc", title: "Accueil", sections }, "Rennes");
    expect(v).toMatchObject({ role: "manager", editable: true, answers: {}, files: [], alerts: [] });
    expect(v.assignment).toMatchObject({ label: "Rennes", status: "NOT_STARTED" });
    expect(v.assignment.dueAt?.toISOString()).toBe("2026-12-04T22:59:00.000Z");
    expect(v.completeness.missing).toEqual(["N1"]);
  });

  it("validateDefinition réexporté : erreurs sémantiques", () => {
    const def = {
      format: "koinonia.campaign" as const,
      version: 1 as const,
      campaign: { key: "k", title: "T" },
      forms: [{ key: "f", title: "F", assignments: [{ key: "a", label: "A" }], sections: [{ ...sections[0], items: [sections[0].items[0], sections[0].items[0]] }] }],
    };
    expect(validateDefinition(def).join()).toMatch(/déjà utilisé/);
  });
});

describe("annonce de lancement et clôture (messages à tous)", () => {
  it("sont collectifs : un seul message, lien générique, jamais de lien personnel", () => {
    for (const kind of ["launch", "closing"] as const) {
      expect(COLLECTIVE_MESSAGE_KINDS).toContain(kind);
      const r = composeMessage(kind, ctx(), { showDone: true });
      expect(r.collective).toBe(true);
      expect(r.messages).toHaveLength(1);
      const text = r.messages[0].text;
      if (kind === "launch") expect(text).toContain("https://koinonia.test/collectes");
      expect(text).not.toMatch(/kc_|\/collectes\/questionnaire\//);
    }
  });

  it("lancement : liste tous les destinataires sollicités, sans les confidentiels par défaut", () => {
    const text = composeMessage("launch", ctx()).messages[0].text;
    expect(text).toContain("Questionnaires et destinataires sollicités");
    for (const label of ["Secrétariat", "Accueil", "EJP", "Pasteure"]) expect(text).toContain(label);
    expect(text).not.toContain("Protection");
    expect(text).toContain("1 contribution(s) confidentielle(s) non comptée(s)");
    expect(text).toContain("vendredi 4 décembre 2026");
  });

  it("clôture : avancement et remerciement des services ayant répondu", () => {
    const text = composeMessage("closing", ctx(), { showDone: true, showRemaining: false }).messages[0].text;
    expect(text).toContain("clôturé");
    expect(text).toContain("*2/4* contributions transmises");
    expect(text).toContain("Ont répondu :");
    expect(text).toContain("Secrétariat");
    expect(text).not.toContain("Restent à répondre");
  });

  it("modèles personnalisables", () => {
    expect(messageTemplatesSchema.safeParse({ launch: "Annonce", closing: "Merci" }).success).toBe(true);
  });
});
