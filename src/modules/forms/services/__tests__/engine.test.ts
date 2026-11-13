import { describe, it, expect } from "vitest";
import { parseAnswers, displayValue, type EngineQuestion } from "../engine";
import { visibleQuestionIds } from "../../schemas";

const q = (id: string, type: EngineQuestion["type"], extra: Partial<EngineQuestion> = {}): EngineQuestion => ({
  id,
  position: Number(id.replace(/\D/g, "")) || 0,
  type,
  label: id.toUpperCase(),
  required: false,
  config: null,
  conditionQuestionId: null,
  conditionValue: null,
  choices: [],
  ...extra,
});
const choices = [
  { id: "c1", label: "Atelier A", capacity: 20 },
  { id: "c2", label: "Atelier B", capacity: null },
];

const ok = (question: EngineQuestion, value: unknown) => parseAnswers([question], { [question.id]: value }).values.get(question.id);
const ko = (question: EngineQuestion, value: unknown) => () => parseAnswers([question], { [question.id]: value });

describe("moteur — les 13 types", () => {
  it("textes : nettoyés et bornés", () => {
    expect(ok(q("q1", "SHORT_TEXT"), "  Jean  ")).toBe("Jean");
    expect(ko(q("q1", "SHORT_TEXT"), "x".repeat(301))).toThrow("300 caractères");
    expect(ok(q("q1", "LONG_TEXT"), "x".repeat(5000))).toHaveLength(5000);
    expect(ko(q("q1", "LONG_TEXT"), 42)).toThrow("texte attendu");
  });

  it("choix unique, liste, choix multiple : seulement des choix connus", () => {
    expect(ok(q("q1", "SINGLE_CHOICE", { choices }), "c1")).toBe("c1");
    expect(ok(q("q1", "DROPDOWN", { choices }), "c2")).toBe("c2");
    expect(ko(q("q1", "SINGLE_CHOICE", { choices }), "c9")).toThrow("choix inconnu");
    expect(ok(q("q1", "MULTIPLE_CHOICE", { choices }), ["c1", "c2", "c1"])).toEqual(["c1", "c2"]);
    expect(ko(q("q1", "MULTIPLE_CHOICE", { choices }), ["c1", "x"])).toThrow("choix inconnu");
  });

  it("oui/non, nombre borné, note de 1 à 5", () => {
    expect(ok(q("q1", "YES_NO"), false)).toBe(false);
    expect(ko(q("q1", "YES_NO"), "oui")).toThrow("oui ou non");
    const n = q("q1", "NUMBER", { config: { min: 0, max: 5 } });
    expect(ok(n, 3)).toBe(3);
    expect(ok(n, "2")).toBe(2);
    expect(ko(n, 6)).toThrow("5 au maximum");
    expect(ko(n, -1)).toThrow("0 au minimum");
    expect(ko(n, 1.5)).toThrow("entier");
    expect(ok(q("q1", "RATING"), 5)).toBe(5);
    expect(ko(q("q1", "RATING"), 6)).toThrow("1 à 5");
  });

  it("date, email, téléphone : formats", () => {
    expect(ok(q("q1", "DATE"), "2026-11-22")).toBe("2026-11-22");
    expect(ko(q("q1", "DATE"), "22/11/2026")).toThrow("date invalide");
    expect(ok(q("q1", "EMAIL"), " Marie@Exemple.fr ")).toBe("marie@exemple.fr");
    expect(ko(q("q1", "EMAIL"), "marie")).toThrow("email invalide");
    expect(ok(q("q1", "PHONE"), "06 12 34 56 78")).toBe("06 12 34 56 78");
    expect(ko(q("q1", "PHONE"), "abc")).toThrow("numéro invalide");
  });

  it("consentement : obligatoire ⇒ coché ; session/niveau sans niveau connu refusé", () => {
    const consent = q("q1", "CONSENT", { required: true });
    expect(ok(consent, true)).toBe(true);
    expect(ko(consent, false)).toThrow("obligatoire");
    expect(ok(q("q1", "CONSENT"), false)).toBe(false);
    expect(ko(q("q1", "SESSION_LEVEL"), "x")).toThrow("choisissez une session");
    expect(ko(q("q1", "SESSION_LEVEL"), { levelId: "inconnu" })).toThrow("niveau inconnu");
  });

  it("obligatoire : vide refusé, facultatif vide ignoré", () => {
    expect(ko(q("q1", "SHORT_TEXT", { required: true }), "  ")).toThrow("« Q1 » : réponse obligatoire");
    expect(parseAnswers([q("q1", "SHORT_TEXT")], {}).values.size).toBe(0);
    expect(ko(q("q1", "MULTIPLE_CHOICE", { required: true, choices }), [])).toThrow("obligatoire");
  });
});

describe("moteur — affichage conditionnel", () => {
  const parent = q("q1", "YES_NO", { required: true });
  const child = q("q2", "NUMBER", { required: true, conditionQuestionId: "q1", conditionValue: "true", config: { min: 0, max: 5 } });
  const grandChild = q("q3", "SHORT_TEXT", { required: true, conditionQuestionId: "q2", conditionValue: "2" });

  it("question masquée : ni requise ni enregistrée, même envoyée", () => {
    const parsed = parseAnswers([parent, child, grandChild], { q1: false, q2: 99, q3: "x" });
    expect([...parsed.values.keys()]).toEqual(["q1"]);
  });

  it("question visible : validée et requise", () => {
    expect(() => parseAnswers([parent, child], { q1: true })).toThrow("« Q2 » : réponse obligatoire");
    expect(parseAnswers([parent, child], { q1: true, q2: 2 }).values.get("q2")).toBe(2);
  });

  it("une question dont le parent est masqué l'est aussi (même règle côté page)", () => {
    expect([...visibleQuestionIds([parent, child, grandChild], { q1: false, q2: 2 })]).toEqual(["q1"]);
    expect([...visibleQuestionIds([parent, child, grandChild], { q1: true, q2: 2 })]).toEqual(["q1", "q2", "q3"]);
  });

  it("condition sur un choix multiple : contient la valeur", () => {
    const multi = q("q1", "MULTIPLE_CHOICE", { choices });
    const dep = q("q2", "SHORT_TEXT", { conditionQuestionId: "q1", conditionValue: "c2" });
    expect(parseAnswers([multi, dep], { q1: ["c1", "c2"], q2: "oui" }).values.has("q2")).toBe(true);
    expect(parseAnswers([multi, dep], { q1: ["c1"], q2: "oui" }).values.has("q2")).toBe(false);
  });

  it("choix retenus collectés pour compter les places", () => {
    const parsed = parseAnswers([q("q1", "SINGLE_CHOICE", { choices }), q("q2", "MULTIPLE_CHOICE", { choices })], { q1: "c1", q2: ["c2"] });
    expect(parsed.choiceIds).toEqual(["c1", "c2"]);
  });
});

describe("affichage d'une valeur", () => {
  it("libellés de choix, oui/non, consentement", () => {
    expect(displayValue({ type: "MULTIPLE_CHOICE", choices }, ["c1", "c2"])).toBe("Atelier A, Atelier B");
    expect(displayValue({ type: "YES_NO", choices: [] }, true)).toBe("Oui");
    expect(displayValue({ type: "CONSENT", choices: [] }, true)).toBe("Accepté");
    expect(displayValue({ type: "NUMBER", choices: [] }, undefined)).toBe("");
  });
});
