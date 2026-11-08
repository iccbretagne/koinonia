import { describe, it, expect } from "vitest";
import { addDays, isJustificationClaimable, monthOf, needsJustification, nextStatus, overageOf, remainderOf } from "../justification-rules";

const base = { type: "BUDGET_ADVANCE" as const, hasAttachment: true, departmentFunction: null, fromShuttle: false, isOverage: false };

describe("justificatifs après la remise des fonds — règles (spec 078)", () => {
  it("éligibilité : avances et notes de frais sans pièce ; jamais la navette, ni une note issue de la navette, ni une note liée", () => {
    expect(needsJustification(base)).toBe(true);
    expect(needsJustification({ ...base, type: "EXPENSE_REPORT" })).toBe(false);
    expect(needsJustification({ ...base, type: "EXPENSE_REPORT", hasAttachment: false })).toBe(true);
    expect(needsJustification({ ...base, departmentFunction: "NAVETTE" })).toBe(false);
    expect(needsJustification({ ...base, type: "EXPENSE_REPORT", hasAttachment: false, fromShuttle: true })).toBe(false);
    expect(needsJustification({ ...base, type: "EXPENSE_REPORT", hasAttachment: false, isOverage: true })).toBe(false);
  });

  it("reliquat et complément, au centime, jamais négatifs", () => {
    expect(remainderOf(300, 268.4)).toBe(31.6);
    expect(remainderOf(300, 350)).toBe(0);
    expect(overageOf(300, 350)).toBe(50);
    expect(overageOf(300, 268.4)).toBe(0);
  });

  it("transitions : dépôt, acceptation avec ou sans reliquat, refus, dispense, restitution", () => {
    expect(nextStatus("AWAITING", "submit", { released: 300, spent: 268.4 })).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "submit", { released: 300, spent: 270 })).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "accept", { released: 300, spent: 268.4 })).toBe("RETURN_DUE");
    expect(nextStatus("SUBMITTED", "accept", { released: 300, spent: 300 })).toBe("SETTLED");
    expect(nextStatus("SUBMITTED", "accept", { released: 300, spent: 350 })).toBe("SETTLED");
    expect(nextStatus("SUBMITTED", "reject", { released: 300, spent: 268.4 })).toBe("AWAITING");
    expect(nextStatus("AWAITING", "waive", { released: 300, spent: 0 })).toBe("RETURN_DUE");
    expect(nextStatus("AWAITING", "waive", { released: 300, spent: 300 })).toBe("SETTLED");
    expect(nextStatus("RETURN_DUE", "return", { released: 300, spent: 268.4 })).toBe("SETTLED");
  });

  it("refuse une action sans objet dans l'état actuel", () => {
    const amounts = { released: 300, spent: 300 };
    expect(() => nextStatus("AWAITING", "accept", amounts)).toThrow(/Action impossible/);
    expect(() => nextStatus("SETTLED", "submit", amounts)).toThrow(/Action impossible/);
    expect(() => nextStatus("SUBMITTED", "return", amounts)).toThrow(/Action impossible/);
    expect(() => nextStatus("RETURN_DUE", "waive", amounts)).toThrow(/Action impossible/);
  });

  it("échéances et regroupement mensuel", () => {
    expect(addDays(new Date("2026-03-03T10:00:00Z"), 7).toISOString()).toBe("2026-03-10T10:00:00.000Z");
    expect(monthOf(new Date(2026, 2, 31))).toBe("2026-03");
    expect(monthOf(new Date(2026, 3, 1))).toBe("2026-04");
  });
});

describe("isJustificationClaimable (arriéré)", () => {
  const claimable = {
    type: "BUDGET_ADVANCE" as const,
    hasAttachment: false,
    departmentFunction: null,
    fromShuttle: false,
    isOverage: false,
    justificationId: null,
    status: "APPROVED",
    payments: [{ releasedAt: new Date() }],
  };
  it("avance entièrement versée, sans justification : réclamable", () => {
    expect(isJustificationClaimable(claimable)).toBe(true);
  });
  it("jamais si déjà demandée, pas entièrement versée, non validée, Navette ou note avec pièce", () => {
    expect(isJustificationClaimable({ ...claimable, justificationId: "j" })).toBe(false);
    expect(isJustificationClaimable({ ...claimable, payments: [{ releasedAt: new Date() }, { releasedAt: null }] })).toBe(false);
    expect(isJustificationClaimable({ ...claimable, payments: [] })).toBe(false);
    expect(isJustificationClaimable({ ...claimable, status: "PROCESSING" })).toBe(false);
    expect(isJustificationClaimable({ ...claimable, departmentFunction: "NAVETTE" })).toBe(false);
    expect(isJustificationClaimable({ ...claimable, type: "EXPENSE_REPORT", hasAttachment: true })).toBe(false);
  });
});
