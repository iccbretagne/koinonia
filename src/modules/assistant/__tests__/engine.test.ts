import { describe, it, expect, vi } from "vitest";
import { viewerFor } from "./test-viewers";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { LocalEngine, extractParams } = await import("../services/engine");
const { NullEmbedder } = await import("../services/embedder");
const { BUILTIN_ENTRIES } = await import("../knowledge");
const { EVAL_CASES } = await import("../knowledge/eval");
const { normalize } = await import("../services/text");

/**
 * Faux modèle de sens déterministe : un vecteur par « idée », reconnue par des mots-clés. Deux
 * textes de la même idée ont une similarité 1, sinon 0,7 (bruit de fond d'un vrai modèle).
 */
const CONCEPTS: string[][] = [
  ["pas la", "pas dispo", "indispo", "pas disponible", "viendrai pas"],
  ["pasteur", "pastoral", "accompagnement", "va pas", "parler"],
];
class ConceptEmbedder {
  readonly model = "fake";
  async embed(texts: readonly string[]) {
    return texts.map((t) => {
      const n = normalize(t);
      const concept = CONCEPTS.findIndex((words) => words.some((w) => n.includes(w)));
      const v = new Float32Array(CONCEPTS.length + 1).fill(0);
      v[concept >= 0 ? concept : CONCEPTS.length] = 1;
      return v;
    });
  }
}
class BrokenEmbedder {
  readonly model = "broken";
  async embed(): Promise<Float32Array[]> {
    throw new Error("onnx absent");
  }
}

const lexical = new LocalEngine(new NullEmbedder());
const fullAccess = viewerFor("SUPER_ADMIN", {
  predicates: ["linkedStar", "ticketing", "shuttleTeam", "secretariatTeam", "mediaTeam", "announcementSheet", "pastoral", "integrationTeam"],
});

describe("moteur de réponse (spec 075)", () => {
  it("reconnaît une question libre, avec fautes et mots familiers", async () => {
    const answer = await lexical.answer({ question: "chui pas dispo dimanch je fé comment", viewer: fullAccess, entries: BUILTIN_ENTRIES });
    expect(answer).toMatchObject({ kind: "howto", key: "KB-021", href: "/disponibilites" });
  });

  it("met la bonne fiche en tête pour au moins 85 % du jeu d'évaluation (recherche par mots)", async () => {
    const cases = EVAL_CASES.filter((c) => !c.semanticOnly);
    let ok = 0;
    for (const c of cases) {
      const a = await lexical.answer({ question: c.question, viewer: fullAccess, entries: BUILTIN_ENTRIES });
      if ("key" in a && a.key === c.expected) ok++;
    }
    expect(ok / cases.length).toBeGreaterThanOrEqual(0.85);
  });

  it("répond par la question de données, avec ses paramètres", async () => {
    const answer = await lexical.answer({
      question: "qui est en service dimanche ?",
      viewer: viewerFor("DEPARTMENT_HEAD"),
      entries: BUILTIN_ENTRIES,
      now: new Date("2026-11-05T10:00:00Z"),
    });
    expect(answer).toMatchObject({ kind: "data", key: "D11", dataQuestion: "planning.servingOnDay", params: { day: "2026-11-08" } });
  });

  it("un STAR reçoit qui peut le faire, sans donnée, pour une question réservée", async () => {
    const answer = await lexical.answer({ question: "qui est en service dimanche ?", viewer: viewerFor("STAR"), entries: BUILTIN_ENTRIES });
    expect(answer.kind).toBe("refused");
    expect(answer).not.toHaveProperty("dataQuestion");
    expect(answer).not.toHaveProperty("href");
  });

  it("un STAR ne reçoit jamais une fiche réservée à un autre rôle", async () => {
    const star = viewerFor("STAR", { predicates: ["linkedStar"] });
    const reserved = BUILTIN_ENTRIES.filter((e) => e.audience.permissions?.includes("planning:edit"));
    for (const entry of reserved) {
      for (const question of entry.questions) {
        const answer = await lexical.answer({ question, viewer: star, entries: BUILTIN_ENTRIES });
        if (answer.kind === "howto" || answer.kind === "data") expect(answer.key, question).not.toBe(entry.key);
        if (answer.kind === "suggestions" || answer.kind === "unknown")
          expect(answer.suggestions.map((s) => s.key)).not.toContain(entry.key);
      }
    }
  });

  it("ne mentionne jamais une fonction d'un module désactivé", async () => {
    const viewer = viewerFor("ACCOUNTANT", { modules: ["core", "planning", "accounting"] });
    const answer = await lexical.answer({ question: "solde de la caisse", viewer, entries: BUILTIN_ENTRIES });
    expect(JSON.stringify(answer)).not.toMatch(/D21|tresorerie/);
  });

  it("refuse poliment une question hors sujet", async () => {
    const answer = await lexical.answer({ question: "quel temps fera-t-il dimanche ?", viewer: fullAccess, entries: BUILTIN_ENTRIES });
    expect(answer).toMatchObject({ kind: "fixed", key: "KB-900" });
  });

  it("ne reconnaît pas une question sans rapport, sans proposer de fiche réservée", async () => {
    const answer = await lexical.answer({ question: "xylophone quantique", viewer: viewerFor("STAR"), entries: BUILTIN_ENTRIES });
    expect(answer.kind).toBe("unknown");
  });

  it("comprend par le sens une formulation sans mot commun", async () => {
    const question = "je viendrai pas, désolé";
    const viewer = viewerFor("STAR", { predicates: ["linkedStar"] });
    expect(await lexical.answer({ question, viewer, entries: BUILTIN_ENTRIES })).not.toMatchObject({ kind: "howto", key: "KB-021" });
    const hybrid = new LocalEngine(new ConceptEmbedder());
    expect(await hybrid.answer({ question, viewer, entries: BUILTIN_ENTRIES })).toMatchObject({ kind: "howto", key: "KB-021" });
  });

  it("repasse en recherche par mots si le modèle échoue", async () => {
    const engine = new LocalEngine(new BrokenEmbedder());
    const answer = await engine.answer({ question: "réserver une salle jeudi", viewer: fullAccess, entries: BUILTIN_ENTRIES });
    expect(answer).toMatchObject({ kind: "howto", key: "KB-140" });
  });
});

describe("paramètres extraits (heure de Paris)", () => {
  const thursday = new Date("2026-11-05T10:00:00Z");
  it("comprend les jours", () => {
    expect(extractParams("qui sert dimanche", thursday)).toEqual({ day: "2026-11-08" });
    expect(extractParams("et jeudi ?", thursday)).toEqual({ day: "2026-11-05" });
    expect(extractParams("demain", thursday)).toEqual({ day: "2026-11-06" });
    expect(extractParams("aujourd'hui", new Date("2026-11-05T23:30:00Z"))).toEqual({ day: "2026-11-06" });
  });
  it("comprend les mois", () => {
    expect(extractParams("mes services ce mois-ci", thursday)).toEqual({ month: "2026-11" });
    expect(extractParams("le mois prochain", thursday)).toEqual({ month: "2026-12" });
    expect(extractParams("mon planning de janvier", thursday)).toEqual({ month: "2027-01" });
    expect(extractParams("octobre", thursday)).toEqual({ month: "2026-10" });
  });
});
