import type { TreasuryDirection, TreasuryMethod } from "@/generated/prisma/client";
import { listAccounts } from "./accounts";
import { budgetVsActual } from "./budget";
import { listClosures } from "./closures";
import { cents, euros, toIsoDate } from "./common";
import { listChequesInHand } from "./deposits";
import { ensureDefaults } from "./defaults";
import { computeLedger, loadAllLines, type RawLine } from "./ledger";

/**
 * Tableau de bord et rapports (spec 076), tous calculés à partir des lignes du registre : ils se
 * recoupent avec lui. Les transferts entre comptes n'y sont ni des entrées ni des sorties.
 */

export interface CategoryTotal {
  categoryId: string;
  name: string;
  direction: TreasuryDirection;
  total: number;
}

export interface Reports {
  inflows: number;
  outflows: number;
  byCategory: CategoryTotal[];
  byPurpose: { purposeId: string; name: string; total: number }[];
  byMethod: { method: TreasuryMethod; inflows: number; outflows: number }[];
  byMonth: { month: string; inflows: number; outflows: number }[];
}

/** Calcul pur des rapports d'une période (`from`/`to` inclus, absents = sans borne). */
export function computeReports(lines: RawLine[], from?: string, to?: string): Reports {
  const inPeriod = lines.filter((l) => l.kind !== "TRANSFER" && (!from || l.date >= from) && (!to || l.date <= to));
  const cat = new Map<string, CategoryTotal & { c: number }>();
  const purpose = new Map<string, { purposeId: string; name: string; c: number }>();
  const method = new Map<TreasuryMethod, { in: number; out: number }>();
  const month = new Map<string, { in: number; out: number }>();
  let inflows = 0;
  let outflows = 0;
  for (const l of inPeriod) {
    const c = cents(l.amount);
    const isIn = l.direction === "IN";
    if (isIn) inflows += c;
    else outflows += c;
    if (l.categoryId) {
      const row = cat.get(l.categoryId) ?? { categoryId: l.categoryId, name: l.categoryName ?? "", direction: l.direction, total: 0, c: 0 };
      row.c += c;
      cat.set(l.categoryId, row);
    }
    if (l.purposeId) {
      const row = purpose.get(l.purposeId) ?? { purposeId: l.purposeId, name: l.purposeName ?? "", c: 0 };
      row.c += c;
      purpose.set(l.purposeId, row);
    }
    const m = method.get(l.method) ?? { in: 0, out: 0 };
    if (isIn) m.in += c;
    else m.out += c;
    method.set(l.method, m);
    const key = l.date.slice(0, 7);
    const mo = month.get(key) ?? { in: 0, out: 0 };
    if (isIn) mo.in += c;
    else mo.out += c;
    month.set(key, mo);
  }
  return {
    inflows: euros(inflows),
    outflows: euros(outflows),
    byCategory: [...cat.values()]
      .map(({ c, ...r }) => ({ ...r, total: euros(c) }))
      .sort((a, b) => a.direction.localeCompare(b.direction) || b.total - a.total),
    byPurpose: [...purpose.values()].map(({ c, ...r }) => ({ ...r, total: euros(c) })).sort((a, b) => b.total - a.total),
    byMethod: [...method].map(([m, v]) => ({ method: m, inflows: euros(v.in), outflows: euros(v.out) })),
    byMonth: [...month]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => ({ month: m, inflows: euros(v.in), outflows: euros(v.out) })),
  };
}

export async function getReports(churchId: string, from?: string, to?: string): Promise<Reports> {
  await ensureDefaults(churchId);
  const accounts = await listAccounts(churchId);
  return computeReports(await loadAllLines(churchId, accounts), from, to);
}

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

/** Mois terminés, depuis le premier solde de départ, qui ne sont pas clôturés. */
function monthsToClose(firstMonth: string | null, current: string, closed: Set<string>): string[] {
  if (!firstMonth) return [];
  const out: string[] = [];
  for (let m = firstMonth; m < current; m = shiftMonth(m, 1)) if (!closed.has(m)) out.push(m);
  return out;
}

/** Tableau de bord d'un mois (AAAA-MM ; défaut : mois courant). */
export async function getDashboard(churchId: string, month?: string, now = new Date()) {
  await ensureDefaults(churchId);
  const today = toIsoDate(now);
  const current = today.slice(0, 7);
  const target = month ?? current;
  const accounts = await listAccounts(churchId);
  const lines = await loadAllLines(churchId, accounts);

  const period = (m: string) => computeLedger(accounts, lines, monthBounds(m), today).period;
  const ledger = computeLedger(accounts, lines, monthBounds(target), today);
  const [cheques, closures, budget] = await Promise.all([
    listChequesInHand(churchId),
    listClosures(churchId),
    budgetVsActual(churchId, Number(target.slice(0, 4)), Number(target.slice(5, 7)), lines),
  ]);
  const closed = new Set(closures.map((c) => c.month));
  const firstMonth = accounts.length ? accounts.map((a) => a.openingDate.slice(0, 7)).sort((a, b) => a.localeCompare(b))[0] : null;

  return {
    month: target,
    accounts: ledger.accounts.filter((a) => !a.archived),
    total: ledger.total,
    period: ledger.period,
    previous: period(shiftMonth(target, -1)),
    lastYear: period(shiftMonth(target, -12)),
    recent: ledger.lines.slice(-8).reverse(),
    warnings: ledger.warnings,
    chequesInHand: { count: cheques.reduce((s, c) => s + c.count, 0), total: euros(cheques.reduce((s, c) => s + cents(c.amount), 0)) },
    toClose: monthsToClose(firstMonth, current, closed),
    budget: budget.filter((b) => b.overBudget || b.warning),
  };
}
