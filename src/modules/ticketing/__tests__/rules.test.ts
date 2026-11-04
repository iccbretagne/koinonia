import { describe, it, expect } from "vitest";
import {
  balances,
  cancelledStatus,
  checkAnswers,
  checkMinors,
  checkStock,
  formatReference,
  planSelections,
  refundableNow,
  type RuleOption,
} from "../services/rules";
import { parseScannedCode } from "../schemas";

const meal: RuleOption = {
  id: "meal",
  label: "Repas",
  type: "CHOICE",
  scope: "PARTICIPANT",
  price: 8,
  stock: 3,
  active: true,
  refundable: true,
  refundDeadline: null,
  variants: [
    { id: "chicken", label: "Poulet", stock: 1, closed: false },
    { id: "fish", label: "Poisson", stock: null, closed: true },
  ],
};
const shirt: RuleOption = { ...meal, id: "shirt", label: "T-shirt", type: "QUANTITY", scope: "BOOKING", price: 0, stock: null, variants: [] };
const options = new Map([
  ["meal", meal],
  ["shirt", shirt],
]);

describe("règles de la billetterie (spec 074)", () => {
  describe("mineurs", () => {
    it("un mineur avec un adulte passe", () => {
      expect(() => checkMinors(["ADULT", "CHILD"], false, false)).not.toThrow();
    });
    it("un mineur seul est refusé par défaut", () => {
      expect(() => checkMinors(["TEEN"], false, false)).toThrow(/adulte/);
    });
    it("autorisé par l'organisateur, un mineur seul exige un responsable légal", () => {
      expect(() => checkMinors(["TEEN"], true, false)).toThrow(/responsable légal/);
      expect(() => checkMinors(["TEEN"], true, true)).not.toThrow();
    });
  });

  describe("options choisies", () => {
    it("un plat est obligatoire et ouvert pour un choix unique", () => {
      expect(planSelections(0, [{ optionId: "meal", variantId: "chicken", quantity: 5 }], options)).toEqual([
        { holder: 0, optionId: "meal", variantId: "chicken", quantity: 1, unitPrice: 8, status: "DUE" },
      ]);
      expect(() => planSelections(0, [{ optionId: "meal", variantId: "fish", quantity: 1 }], options)).toThrow(/indisponible/);
    });
    it("la portée doit correspondre et une option n'est choisie qu'une fois", () => {
      expect(() => planSelections(0, [{ optionId: "shirt", quantity: 1 }], options)).toThrow(/mal placée/);
      expect(() =>
        planSelections(null, [
          { optionId: "shirt", quantity: 1 },
          { optionId: "shirt", quantity: 2 },
        ], options)
      ).toThrow(/deux fois/);
    });
    it("une option gratuite est FREE", () => {
      expect(planSelections(null, [{ optionId: "shirt", quantity: 2 }], options)[0]).toMatchObject({ status: "FREE", quantity: 2 });
    });
  });

  describe("stock", () => {
    const used = { options: new Map([["meal", 2]]), variants: new Map<string, number>() };
    it("refuse au-delà du stock d'une option", () => {
      expect(() => checkStock([{ optionId: "meal", variantId: null, quantity: 2 }], options, used)).toThrow(/Stock épuisé/);
    });
    it("refuse au-delà du stock d'une variante", () => {
      expect(() => checkStock([{ optionId: "meal", variantId: "chicken", quantity: 1 }], options, { ...used, variants: new Map([["chicken", 1]]) })).toThrow(/Poulet/);
    });
    it("accepte dans la limite", () => {
      expect(() => checkStock([{ optionId: "meal", variantId: "chicken", quantity: 1 }], options, used)).not.toThrow();
    });
  });

  it("questions obligatoires et clés inconnues écartées", () => {
    const questions = [{ id: "allergy", label: "Allergies", required: true }];
    expect(() => checkAnswers(questions, {})).toThrow(/Allergies/);
    expect(checkAnswers(questions, { allergy: "arachide", hack: "x" })).toEqual({ allergy: "arachide" });
  });

  describe("annulation", () => {
    it("à régler ou déclaré : annulé ; payé remboursable : à rembourser ; payé hors délai : reste payé", () => {
      expect(cancelledStatus("DUE", true)).toBe("CANCELLED");
      expect(cancelledStatus("DECLARED", false)).toBe("CANCELLED");
      expect(cancelledStatus("PAID", true)).toBe("REFUND_DUE");
      expect(cancelledStatus("PAID", false)).toBe("PAID");
    });
    it("délai de remboursement", () => {
      const now = new Date("2030-12-10");
      expect(refundableNow(true, new Date("2030-12-01"), now)).toBe(false);
      expect(refundableNow(true, null, now)).toBe(true);
      expect(refundableNow(false, null, now)).toBe(false);
    });
  });

  it("soldes par état", () => {
    expect(
      balances([
        { type: "entry", id: "a", label: "", amount: 10, status: "PAID", pickup: false },
        { type: "item", id: "b", label: "", amount: 8, status: "DUE", pickup: true },
        { type: "item", id: "c", label: "", amount: 5, status: "DECLARED", pickup: false },
        { type: "item", id: "d", label: "", amount: 4, status: "REFUND_DUE", pickup: false },
      ])
    ).toEqual({ total: 23, due: 8, declared: 5, paid: 10, refundDue: 4, refunded: 0 });
  });

  it("référence courte", () => {
    expect(formatReference("NT26", 42)).toBe("NT26-0042");
  });

  it("lecture des codes scannés", () => {
    const t = "a".repeat(64);
    expect(parseScannedCode(`https://koinonia.test/billet/${t}`)).toEqual({ scope: "ticket", token: t });
    expect(parseScannedCode(`KOINONIA-RESA:${t}`)).toEqual({ scope: "scan", token: t });
    expect(parseScannedCode(`KOINONIA-BADGE:${t}`)).toEqual({ scope: "badge", token: t });
    expect(parseScannedCode(`KOINONIA-REPAS:${t}`)).toEqual({ scope: "label", token: t });
    expect(parseScannedCode("KOINONIA-RESA:court")).toBeNull();
    expect(parseScannedCode("https://ailleurs.test")).toBeNull();
  });
});
