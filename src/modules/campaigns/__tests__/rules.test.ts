/**
 * Tests — contrôles de cohérence (spec 090), dont les règles du F9 : entonnoir E3 ≥ … ≥ E6,
 * L4 = Non ⇒ L5 = 0, X3 ≤ X1 + X2, K1 = 0. Zéro est une valeur, vide est « non évalué ».
 */
import { describe, it, expect } from "vitest";
import type { Qualifier, Rule } from "../schemas";
import { evaluateCheck, evaluateRules, ruleCodes, ruleScope, type RuleValue } from "../services/rules";

const values = (entries: Record<string, unknown | [unknown, Qualifier]>) =>
  new Map<string, RuleValue>(
    Object.entries(entries).map(([code, v]) =>
      Array.isArray(v) ? [code, { value: v[0], qualifier: v[1] }] : [code, { value: v, qualifier: "EXACT" }]
    )
  );

const funnel: Rule = { key: "entonnoir", message: "E3 ≥ E4 ≥ E5 ≥ E6", check: { chain_gte: ["E3", "E4", "E5", "E6"] } };
const l4l5: Rule = { key: "l4-l5", message: "Sans L4, L5 = 0", check: { implies: [{ eq: ["L4", false] }, { eq: ["L5", 0] }] } };
const xsum: Rule = { key: "x", message: "X3 ≤ X1 + X2", check: { lte: ["X3", { sum: ["X1", "X2"] }] } };
const k1: Rule = { key: "k1", message: "K1 = 0", check: { eq: ["K1", 0] } };

describe("règles F9", () => {
  it("chain_gte E3..E6", () => {
    expect(evaluateCheck(funnel.check, values({ E3: 10, E4: 8, E5: 8, E6: 0 }))).toBe("ok");
    expect(evaluateCheck(funnel.check, values({ E3: 10, E4: 8, E5: 9, E6: 0 }))).toBe("violated");
    expect(evaluateCheck(funnel.check, values({ E3: 10, E4: 8, E5: null, E6: 0 }))).toBe("skipped");
    expect(evaluateCheck(funnel.check, values({ E3: 10, E4: 8, E6: 0 }))).toBe("skipped");
    expect(evaluateCheck({ chain_lte: ["E3", "E4"] }, values({ E3: 1, E4: 2 }))).toBe("ok");
  });

  it("implies L4 = Non ⇒ L5 = 0", () => {
    expect(evaluateCheck(l4l5.check, values({ L4: false, L5: 0 }))).toBe("ok");
    expect(evaluateCheck(l4l5.check, values({ L4: false, L5: 3 }))).toBe("violated");
    expect(evaluateCheck(l4l5.check, values({ L4: true, L5: 3 }))).toBe("ok"); // prémisse fausse
    expect(evaluateCheck(l4l5.check, values({ L5: 3 }))).toBe("skipped"); // prémisse non évaluable
    expect(evaluateCheck(l4l5.check, values({ L4: false }))).toBe("skipped");
  });

  it("X3 ≤ sum(X1, X2)", () => {
    expect(evaluateCheck(xsum.check, values({ X1: 2, X2: 3, X3: 5 }))).toBe("ok");
    expect(evaluateCheck(xsum.check, values({ X1: 2, X2: 3, X3: 6 }))).toBe("violated");
    expect(evaluateCheck(xsum.check, values({ X1: 2, X3: 1 }))).toBe("skipped");
    expect(evaluateCheck(xsum.check, values({ X1: 0.1, X2: 0.2, X3: 0.3 }))).toBe("ok");
  });

  it("eq K1 0 : zéro ≠ vide", () => {
    expect(evaluateCheck(k1.check, values({ K1: 0 }))).toBe("ok");
    expect(evaluateCheck(k1.check, values({ K1: 1 }))).toBe("violated");
    expect(evaluateCheck(k1.check, values({ K1: null }))).toBe("skipped");
    expect(evaluateCheck(k1.check, values({ K1: "" }))).toBe("skipped");
    expect(evaluateCheck(k1.check, values({}))).toBe("skipped");
  });
});

describe("sémantique", () => {
  it("sans objet / NSP : non évalué ; estimation évaluée", () => {
    expect(evaluateCheck(k1.check, values({ K1: [0, "NOT_APPLICABLE"] }))).toBe("skipped");
    expect(evaluateCheck(k1.check, values({ K1: [0, "NSP"] }))).toBe("skipped");
    expect(evaluateCheck(k1.check, values({ K1: [2, "ESTIMATE"] }))).toBe("violated");
  });

  it("booléens comparables en eq/neq seulement, types mêlés non évalués", () => {
    expect(evaluateCheck({ neq: ["B", true] }, values({ B: false }))).toBe("ok");
    expect(evaluateCheck({ gte: ["B", 0] }, values({ B: true }))).toBe("skipped");
    expect(evaluateCheck({ eq: ["B", 0] }, values({ B: false }))).toBe("skipped");
    expect(evaluateCheck({ gt: ["T", 0] }, values({ T: "texte" }))).toBe("skipped");
  });

  it("comparateurs stricts", () => {
    const v = values({ A: 2, B: 2 });
    expect(evaluateCheck({ lt: ["A", "B"] }, v)).toBe("violated");
    expect(evaluateCheck({ gt: ["A", 1] }, v)).toBe("ok");
    expect(evaluateCheck({ lte: ["A", "B"] }, v)).toBe("ok");
    expect(evaluateCheck({ gte: ["A", 3] }, v)).toBe("violated");
  });

  it("all : violé l'emporte, puis non évalué", () => {
    expect(evaluateCheck({ all: [{ eq: ["A", 1] }, { eq: ["Z", 1] }] }, values({ A: 2 }))).toBe("violated");
    expect(evaluateCheck({ all: [{ eq: ["A", 2] }, { eq: ["Z", 1] }] }, values({ A: 2 }))).toBe("skipped");
    expect(evaluateCheck({ all: [{ eq: ["A", 2] }] }, values({ A: 2 }))).toBe("ok");
  });
});

describe("evaluateRules, ruleCodes, ruleScope", () => {
  it("résultats avec valeurs des codes", () => {
    expect(evaluateRules([xsum], values({ X1: 2, X2: 3, X3: 0 }))).toEqual([
      { key: "x", message: "X3 ≤ X1 + X2", result: "ok", values: { X3: 0, X1: 2, X2: 3 } },
    ]);
    expect(evaluateRules([k1], values({}))[0].values).toEqual({ K1: null });
  });

  it("codes sans doublon", () => {
    expect(ruleCodes({ check: { all: [{ gte: ["A", "B"] }, { implies: [{ eq: ["A", 1] }, { lte: ["C", { sum: ["A", 2] }] }] }] } })).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("locale si un seul questionnaire, croisée sinon", () => {
    const byForm = new Map([
      ["X1", "f1"],
      ["X2", "f1"],
      ["X3", "f1"],
      ["E3", "f1"],
      ["E4", "f2"],
    ]);
    expect(ruleScope(xsum, byForm)).toEqual({ local: "f1" });
    expect(ruleScope({ check: { gte: ["E3", "E4"] } }, byForm)).toBe("cross");
    expect(ruleScope(k1, byForm)).toBe("cross"); // code inconnu
  });
});
