import { describe, expect, it } from "vitest";
import { composeMessage, DEFAULT_MESSAGE_TEMPLATES } from "@/modules/campaigns/schemas";
import {
  buildMessageContext,
  composeOptions,
  contributionLink,
  groupIssues,
  initialSettings,
  matchesTrackingFilter,
  messageKindForStatus,
  readinessFailures,
  templatesPayload,
  type OverviewForMessages,
} from "../pilotage";

const NOW = new Date("2026-12-01T10:00:00.000Z");
const APP = "https://koinonia.test/";

const overview: OverviewForMessages = {
  campaign: { title: "Bilan F9", churchName: "ICC Rennes", dueAt: "2026-12-04T22:59:00.000Z", messageTemplates: {} },
  forms: [
    {
      title: "Départements",
      confidential: false,
      assignments: [
        { id: "a1", label: "Accueil", status: "NOT_STARTED", dueAt: "2026-11-30T22:59:00.000Z" },
        { id: "a2", label: "Son", status: "SUBMITTED", dueAt: "2026-12-04T22:59:00.000Z" },
        { id: "a3", label: "Louange", status: "CHANGES_REQUESTED", dueAt: "2026-12-04T22:59:00.000Z" },
      ],
    },
    {
      title: "Finances",
      confidential: true,
      assignments: [{ id: "c1", label: "Trésorerie", status: "NOT_STARTED", dueAt: "2026-12-04T22:59:00.000Z" }],
    },
  ],
};

describe("filtres du Suivi", () => {
  const row = (kinds: string[], exploitable = false) => ({
    issues: kinds.map((kind, i) => ({ code: `Q${i}`, label: `Question ${i}`, kind: kind as "missing" })),
    exploitable,
  });

  it("sans filtre, tout passe ; sinon par nature de question concernée", () => {
    expect(matchesTrackingFilter(row([]), null)).toBe(true);
    expect(matchesTrackingFilter(row(["to_research"]), "to_research")).toBe(true);
    expect(matchesTrackingFilter(row(["estimate"]), "to_research")).toBe(false);
    expect(matchesTrackingFilter(row(["file_pending"]), "file_pending")).toBe(true);
    expect(matchesTrackingFilter(row(["check"]), "check")).toBe(true);
  });

  it("« Exploitables » lit le caractère exploitable, pas les questions", () => {
    expect(matchesTrackingFilter(row(["estimate"], true), "exploitable")).toBe(true);
    expect(matchesTrackingFilter(row([], false), "exploitable")).toBe(false);
  });

  it("regroupe les questions concernées dans un ordre stable", () => {
    const groups = groupIssues([
      { code: "E", label: "Estimée", kind: "estimate" },
      { code: "M", label: "Manquante", kind: "missing" },
      { code: "M2", label: "Manquante 2", kind: "missing" },
    ]);
    expect(groups.map((g) => [g.kind, g.items.length])).toEqual([
      ["missing", 2],
      ["estimate", 1],
    ]);
  });
});

describe("type de message par statut", () => {
  it("correction demandée → nouvelle soumission ; en retard → échéance dépassée ; sinon relance", () => {
    expect(messageKindForStatus({ status: "CHANGES_REQUESTED", dueAt: "2026-11-01T00:00:00.000Z" }, NOW)).toBe("resubmission");
    expect(messageKindForStatus({ status: "IN_PROGRESS", dueAt: "2026-11-30T22:59:00.000Z" }, NOW)).toBe("overdue");
    expect(messageKindForStatus({ status: "NOT_STARTED", dueAt: "2026-12-04T22:59:00.000Z" }, NOW)).toBe("individual");
    expect(messageKindForStatus({ status: "SUBMITTED", dueAt: "2026-11-01T00:00:00.000Z" }, NOW)).toBe("individual");
  });
});

describe("contexte des messages", () => {
  it("donne à chaque contribution son adresse dans Koinonia, ou le lien personnel fourni", () => {
    const ctx = buildMessageContext(overview, APP, NOW, { a3: "https://koinonia.test/collecte/jeton" });
    expect(ctx.appUrl).toBe("https://koinonia.test");
    expect(ctx.contributions.find((c) => c.id === "a1")?.link).toBe(contributionLink(APP, "a1"));
    expect(contributionLink(APP, "a1")).toBe("https://koinonia.test/collectes/r/a1");
    expect(ctx.contributions.find((c) => c.id === "a3")?.link).toBe("https://koinonia.test/collecte/jeton");
    expect(ctx.contributions.find((c) => c.id === "c1")?.confidential).toBe(true);
  });

  it("relance pré-ciblée : un seul message, avec le lien de la contribution", () => {
    const settings = initialSettings({ kind: "individual", contributionId: "a1" });
    const r = composeMessage("individual", buildMessageContext(overview, APP, NOW), composeOptions(settings, {}));
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].text).toContain("https://koinonia.test/collectes/r/a1");
    expect(r.messages[0].text).toContain("Accueil");
  });

  it("point d'avancement : aucun lien de contribution, confidentiels exclus par défaut", () => {
    const settings = initialSettings();
    const r = composeMessage("progress", buildMessageContext(overview, APP, NOW), composeOptions(settings, {}));
    expect(r.collective).toBe(true);
    expect(r.messages[0].text).not.toContain("/collectes/r/");
    expect(r.messages[0].text).not.toContain("Trésorerie");
    expect(r.counts.total).toBe(3);
    expect(r.excludedConfidential).toBe(1);
  });

  it("ciblages : restantes, en retard, par statut, une contribution", () => {
    const ctx = buildMessageContext(overview, APP, NOW);
    const ids = (mode: "remaining" | "overdue" | "statuses" | "one", extra: Partial<ReturnType<typeof initialSettings>> = {}) =>
      composeMessage("individual", ctx, composeOptions({ ...initialSettings({ kind: "individual" }), mode, ...extra }, {})).targets.map((t) => t.id);
    expect(ids("remaining")).toEqual(["a1", "a3"]);
    expect(ids("overdue")).toEqual(["a1"]);
    expect(ids("statuses", { statuses: ["SUBMITTED"] })).toEqual(["a2"]);
    expect(ids("statuses", { statuses: [] })).toEqual([]);
    expect(ids("one", { contributionId: "c1" })).toEqual(["c1"]);
    expect(ids("one", { contributionId: null })).toEqual([]);
  });

  it("utilise le modèle personnalisé de la campagne", () => {
    const opts = composeOptions(initialSettings({ kind: "individual", contributionId: "a1" }), { individual: "Coucou {{destinataire}}" });
    expect(composeMessage("individual", buildMessageContext(overview, APP, NOW), opts).messages[0].text).toBe("Coucou Accueil");
  });
});

describe("modèles de messages", () => {
  it("ne garde que les textes personnalisés ; rien de personnalisé ⇒ null", () => {
    expect(templatesPayload({ ...DEFAULT_MESSAGE_TEMPLATES }, DEFAULT_MESSAGE_TEMPLATES)).toBeNull();
    expect(templatesPayload({ ...DEFAULT_MESSAGE_TEMPLATES, initial: "  " }, DEFAULT_MESSAGE_TEMPLATES)).toBeNull();
    expect(templatesPayload({ ...DEFAULT_MESSAGE_TEMPLATES, progress: " Point {{date}} " }, DEFAULT_MESSAGE_TEMPLATES)).toEqual({ progress: "Point {{date}}" });
  });
});

describe("préparer l'ouverture", () => {
  it("liste les points non satisfaits", () => {
    expect(readinessFailures(null)).toEqual([]);
    expect(
      readinessFailures({
        ready: false,
        items: [
          { key: "forms", label: "Questionnaires", ok: true },
          { key: "respondents", label: "Répondants", ok: false, detail: "Sans répondant valide : Son" },
          { key: "rules", label: "Contrôles", ok: false },
        ],
      })
    ).toEqual(["Répondants : Sans répondant valide : Son", "Contrôles"]);
  });
});

describe("changement de type de message", () => {
  it("la clôture affiche les services ayant répondu et masque les restants, puis revient au défaut", async () => {
    const { initialSettings, withKind } = await import("../pilotage");
    const closing = withKind(initialSettings(), "closing");
    expect(closing).toMatchObject({ kind: "closing", showDone: true, showRemaining: false });
    expect(withKind(closing, "progress")).toMatchObject({ kind: "progress", showDone: false, showRemaining: true });
    expect(withKind(initialSettings(), "launch")).toMatchObject({ kind: "launch", showDone: false, showRemaining: true });
  });
});
