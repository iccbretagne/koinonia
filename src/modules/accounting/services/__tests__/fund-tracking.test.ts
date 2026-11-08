import { describe, it, expect } from "vitest";
import { FUND_BOXES, computeFundTracking, type TrackedJustification, type TrackedRequest } from "../fund-tracking";

let n = 0;
const req = (p: Partial<TrackedRequest>): TrackedRequest => ({
  id: `r${++n}`,
  createdAt: new Date(2026, 2, n),
  type: "BUDGET_ADVANCE",
  departmentId: "louange",
  departmentName: "Louange",
  departmentFunction: null,
  released: 0,
  pendingPayment: false,
  hasAttachment: false,
  fromShuttle: false,
  isOverage: false,
  justificationId: null,
  ...p,
});
const just = (id: string, status: TrackedJustification["status"], spent: number | null, requests: TrackedRequest[]): TrackedJustification => ({
  id,
  status,
  spentAmount: spent,
  requests: requests.map((r) => ({ id: r.id, createdAt: r.createdAt, released: r.released })),
});
const sumBoxes = (t: Record<(typeof FUND_BOXES)[number], number>) => Math.round(FUND_BOXES.reduce((s, b) => s + t[b], 0) * 100) / 100;

describe("suivi de l'argent versé (spec 078)", () => {
  it("range chaque cas dans sa case et respecte « versé = somme des cases » partout", () => {
    const avanceRendue = req({ released: 300, justificationId: "j1" });
    const avanceAttendue = req({ released: 120, justificationId: "j2" });
    const avanceDepassee = req({ released: 300, justificationId: "j3" });
    const complement = req({ released: 50, type: "EXPENSE_REPORT", isOverage: true });
    const reliquatDu = req({ released: 80, justificationId: "j4", departmentId: "accueil", departmentName: "Accueil" });
    const noteAvecPiece = req({ released: 45.5, type: "EXPENSE_REPORT", hasAttachment: true, departmentId: null, departmentName: null });
    const navette = req({ released: 200, departmentId: "nav", departmentName: "Navette", departmentFunction: "NAVETTE" });
    const issueNavette = req({ released: 30, type: "EXPENSE_REPORT", fromShuttle: true, departmentId: null, departmentName: null });
    const ancienne = req({ released: 90 });
    const enCours = req({ released: 60, pendingPayment: true });
    const dispense = req({ released: 40, justificationId: "j5" });
    const nonVersee = req({ released: 0, pendingPayment: true });
    const requests = [avanceRendue, avanceAttendue, avanceDepassee, complement, reliquatDu, noteAvecPiece, navette, issueNavette, ancienne, enCours, dispense, nonVersee];
    const justifications = [
      just("j1", "SETTLED", 268.4, [avanceRendue]),
      just("j2", "SUBMITTED", 100, [avanceAttendue]),
      just("j3", "SETTLED", 350, [avanceDepassee]),
      just("j4", "RETURN_DUE", 55, [reliquatDu]),
      just("j5", "SETTLED", 40, [dispense]),
    ];
    const t = computeFundTracking(requests, justifications);
    expect(t.totals).toEqual({
      released: 1315.5,
      justified: 268.4 + 300 + 50 + 55 + 45.5 + 30 + 40,
      returned: 31.6,
      returnDue: 25,
      toJustify: 180,
      shuttle: 200,
      beforeTracking: 90,
    });
    expect(sumBoxes(t.totals)).toBe(t.totals.released);
    const total = requests.reduce((s, r) => s + r.released, 0);
    expect(t.totals.released).toBe(Math.round(total * 100) / 100);
    for (const d of t.byDepartment) expect(sumBoxes(d)).toBe(d.released);
    expect(t.requestIds.returned).toEqual([avanceRendue.id]);
    expect(t.requestIds.beforeTracking).toEqual([ancienne.id]);
  });

  it("un dépassement n'est jamais compté deux fois : l'avance au plus son versé, le complément son propre versement", () => {
    const avance = req({ released: 300, justificationId: "j" });
    const complement = req({ released: 50, type: "EXPENSE_REPORT", isOverage: true });
    const t = computeFundTracking([avance, complement], [just("j", "SETTLED", 350, [avance])]);
    expect(t.totals.justified).toBe(350);
    expect(t.totals.released).toBe(350);
  });

  it("série mensuelle : les factures couvrent les versements dans l'ordre, sans prorata", () => {
    const s1 = req({ released: 100, justificationId: "m" });
    const s2 = req({ released: 100, justificationId: "m" });
    const t = computeFundTracking([s1, s2], [just("m", "RETURN_DUE", 150, [s1, s2])]);
    expect(t.requestIds.justified).toEqual([s1.id, s2.id]);
    expect(t.totals).toMatchObject({ released: 200, justified: 150, returnDue: 50 });
    // Une seule occurrence dans la période affichée : sa part reste exacte.
    const only = computeFundTracking([s2], [just("m", "RETURN_DUE", 150, [s1, s2])]);
    expect(only.totals).toMatchObject({ released: 100, justified: 50, returnDue: 50 });
  });

  it("taux de justification par département, hors navette et hors période antérieure", () => {
    const a = req({ released: 100, justificationId: "a" });
    const b = req({ released: 100, pendingPayment: true });
    const old = req({ released: 50 });
    const t = computeFundTracking([a, b, old], [just("a", "SETTLED", 100, [a])]);
    expect(t.byDepartment[0]).toMatchObject({ name: "Louange", released: 250, justified: 100, toJustify: 100, beforeTracking: 50, rate: 50 });
  });
});
