import type { FinancialJustificationStatus, FinancialRequestType } from "@/generated/prisma/client";
import { cents } from "./justification-rules";

/**
 * Suivi de l'argent versé (spec 078) : chaque euro versé est rangé dans **une seule** case, et les
 * cases s'additionnent exactement au montant versé. Règle pure, testée par invariant.
 *
 * Versé = Justifié + Rendu + À rendre + À justifier + Navette + Avant le suivi
 */

export const FUND_BOXES = ["justified", "returned", "returnDue", "toJustify", "shuttle", "beforeTracking"] as const;
export type FundBox = (typeof FUND_BOXES)[number];
export type FundTotals = Record<FundBox | "released", number>;

export interface TrackedRequest {
  id: string;
  createdAt: Date;
  type: FinancialRequestType;
  departmentId: string | null;
  departmentName: string | null;
  departmentFunction: string | null;
  /** Total versé sur cette demande. */
  released: number;
  /** Une tranche reste à verser. */
  pendingPayment: boolean;
  hasAttachment: boolean;
  fromShuttle: boolean;
  isOverage: boolean;
  justificationId: string | null;
}

export interface TrackedJustification {
  id: string;
  status: FinancialJustificationStatus;
  spentAmount: number | null;
  /** Demandes couvertes, avec leur versé (y compris hors de la période affichée). */
  requests: { id: string; createdAt: Date; released: number }[];
}

const emptyTotals = (): FundTotals => ({ released: 0, justified: 0, returned: 0, returnDue: 0, toJustify: 0, shuttle: 0, beforeTracking: 0 });

/**
 * Répartition d'une justification décidée entre ses demandes : les factures couvrent les
 * versements dans l'ordre des demandes ; ce qui dépasse le dépensé est rendu (ou à rendre). Exact
 * au centime, sans prorata.
 */
export function splitJustification(j: TrackedJustification): Map<string, Partial<Record<FundBox, number>>> {
  const out = new Map<string, Partial<Record<FundBox, number>>>();
  const ordered = [...j.requests].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  if (j.status === "AWAITING" || j.status === "SUBMITTED") {
    for (const r of ordered) out.set(r.id, { toJustify: cents(r.released) });
    return out;
  }
  const total = cents(ordered.reduce((s, r) => s + r.released, 0));
  let toCover = cents(Math.min(j.spentAmount ?? total, total));
  const restBox: FundBox = j.status === "RETURN_DUE" ? "returnDue" : "returned";
  for (const r of ordered) {
    const justified = cents(Math.min(toCover, r.released));
    toCover = cents(toCover - justified);
    const rest = cents(r.released - justified);
    out.set(r.id, { justified, ...(rest > 0 ? { [restBox]: rest } : {}) });
  }
  return out;
}

/** Case(s) d'une demande versée, avec les montants. */
export function classifyRequest(r: TrackedRequest, justifications: Map<string, TrackedJustification>): Partial<Record<FundBox, number>> {
  const released = cents(r.released);
  if (released <= 0) return {};
  if (r.departmentFunction === "NAVETTE") return { shuttle: released };
  if (r.isOverage || r.fromShuttle) return { justified: released };
  const j = r.justificationId ? justifications.get(r.justificationId) : undefined;
  if (j) return splitJustification(j).get(r.id) ?? { toJustify: released };
  if (r.type === "EXPENSE_REPORT" && r.hasAttachment) return { justified: released };
  // Avance (ou note sans pièce) sans justification : en cours de versement, ou versée avant la
  // mise en service du suivi (une justification s'ouvre sinon au dernier versement).
  return r.pendingPayment ? { toJustify: released } : { beforeTracking: released };
}

export interface FundTracking {
  totals: FundTotals;
  byDepartment: (FundTotals & { name: string; rate: number | null })[];
  /** Demandes de chaque case, pour ouvrir la liste depuis un montant. */
  requestIds: Record<FundBox, string[]>;
}

/** Taux de justification : justifié ÷ (versé hors navette et hors période antérieure). */
export function justificationRate(t: FundTotals): number | null {
  const base = cents(t.released - t.shuttle - t.beforeTracking);
  return base > 0 ? Math.round((t.justified / base) * 100) : null;
}

export function computeFundTracking(requests: TrackedRequest[], justifications: TrackedJustification[]): FundTracking {
  const byId = new Map(justifications.map((j) => [j.id, j]));
  const totals = emptyTotals();
  const departments = new Map<string, FundTotals & { name: string }>();
  const requestIds = Object.fromEntries(FUND_BOXES.map((b) => [b, [] as string[]])) as Record<FundBox, string[]>;
  for (const r of requests) {
    const boxes = classifyRequest(r, byId);
    const key = r.departmentId ?? "__personal__";
    const dept = departments.get(key) ?? { ...emptyTotals(), name: r.departmentName ?? "Personnel" };
    for (const [box, amount] of Object.entries(boxes) as [FundBox, number][]) {
      if (!amount) continue;
      totals[box] = cents(totals[box] + amount);
      totals.released = cents(totals.released + amount);
      dept[box] = cents(dept[box] + amount);
      dept.released = cents(dept.released + amount);
      requestIds[box].push(r.id);
    }
    if (dept.released > 0) departments.set(key, dept);
  }
  return {
    totals,
    byDepartment: [...departments.values()].map((d) => ({ ...d, rate: justificationRate(d) })).sort((a, b) => b.released - a.released),
    requestIds,
  };
}
