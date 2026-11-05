import { ApiError } from "@/lib/api-utils";
import type { TreasuryDirection } from "@/generated/prisma/client";
import { BUDGET_WARNING_RATIO, type BudgetInput } from "../schemas";
import { listAccounts } from "./accounts";
import { listCategories, type CategoryView } from "./categories";
import { audit, cents, db, euros, type TreasuryActor } from "./common";
import { loadAllLines, type RawLine } from "./ledger";

/**
 * Budget prévisionnel annuel par catégorie (spec 076), réparti par mois. Le réalisé vient du
 * registre (transferts exclus) : il se recoupe donc avec lui.
 */

export interface BudgetRow {
  categoryId: string;
  monthly: number[];
  annual: number;
}

/** Répartit un montant annuel en 12 mois égaux, en centimes ; le reste va sur décembre. */
export function splitAnnual(annual: number): number[] {
  const total = cents(annual);
  const base = Math.floor(total / 12);
  return Array.from({ length: 12 }, (_, i) => euros(i === 11 ? total - base * 11 : base));
}

export async function getBudget(churchId: string, year: number): Promise<BudgetRow[]> {
  const prisma = await db();
  const rows = await prisma.treasuryBudget.findMany({ where: { churchId, year } });
  const byCategory = new Map<string, number[]>();
  for (const r of rows) {
    const months = byCategory.get(r.categoryId) ?? new Array<number>(12).fill(0);
    months[r.month - 1] = Number(r.amount);
    byCategory.set(r.categoryId, months);
  }
  return [...byCategory].map(([categoryId, monthly]) => ({
    categoryId,
    monthly,
    annual: euros(monthly.reduce((s, m) => s + cents(m), 0)),
  }));
}

/** Enregistre le budget des catégories données (les autres catégories gardent le leur). */
export async function setBudget(churchId: string, input: BudgetInput, actor: TreasuryActor) {
  const prisma = await db();
  const ids = [...new Set(input.rows.map((r) => r.categoryId))];
  const found = await prisma.treasuryCategory.count({ where: { id: { in: ids }, churchId } });
  if (found !== ids.length) throw new ApiError(400, "Catégorie introuvable");
  const data = input.rows.flatMap((r) => {
    const monthly = r.monthly ?? splitAnnual(r.annual ?? 0);
    return monthly.map((amount, i) => ({ churchId, year: input.year, month: i + 1, categoryId: r.categoryId, amount }));
  });
  await prisma.$transaction([
    prisma.treasuryBudget.deleteMany({ where: { churchId, year: input.year, categoryId: { in: ids } } }),
    prisma.treasuryBudget.createMany({ data }),
  ]);
  await audit(churchId, actor, "UPDATE", "TreasuryBudget", `${churchId}:${input.year}`, {
    year: input.year,
    rows: input.rows.map((r) => ({ categoryId: r.categoryId, annual: r.annual ?? null, monthly: r.monthly ?? null })),
  });
  return getBudget(churchId, input.year);
}

const isActual = (l: RawLine) => l.kind !== "TRANSFER" && !!l.categoryId;

/** Réalisé par catégorie et par mois d'une année, à partir des lignes du registre. */
export function actualByCategory(lines: RawLine[], year: number): Map<string, number[]> {
  const prefix = String(year);
  const out = new Map<string, number[]>();
  for (const l of lines) {
    if (!isActual(l) || !l.date.startsWith(prefix)) continue;
    const months = out.get(l.categoryId!) ?? new Array<number>(12).fill(0);
    months[Number(l.date.slice(5, 7)) - 1] += cents(l.amount);
    out.set(l.categoryId!, months);
  }
  return out;
}

/** Reprend le budget de `year` depuis l'année précédente : son budget ou son réalisé. */
export async function copyBudget(churchId: string, year: number, from: "budget" | "actual", actor: TreasuryActor) {
  let rows: BudgetRow[];
  if (from === "budget") {
    rows = await getBudget(churchId, year - 1);
  } else {
    const accounts = await listAccounts(churchId);
    const actual = actualByCategory(await loadAllLines(churchId, accounts), year - 1);
    rows = [...actual].map(([categoryId, months]) => ({
      categoryId,
      monthly: months.map(euros),
      annual: euros(months.reduce((s, m) => s + m, 0)),
    }));
  }
  if (rows.length === 0) throw new ApiError(400, `Rien à reprendre de ${year - 1}`);
  return setBudget(churchId, { year, rows: rows.map((r) => ({ categoryId: r.categoryId, monthly: r.monthly })) }, actor);
}

export interface BudgetComparison {
  categoryId: string;
  name: string;
  direction: TreasuryDirection;
  annualBudget: number;
  month: { budget: number; actual: number; gap: number; ratio: number | null };
  ytd: { budget: number; actual: number; gap: number; ratio: number | null };
  yearActual: number;
  yearRatio: number | null;
  overBudget: boolean;
  warning: boolean;
}

const ratio = (actual: number, budget: number) => (budget > 0 ? actual / budget : null);

/** Calcul pur : réalisé contre budget pour un mois (1–12) d'une année. */
export function compareBudget(
  categories: CategoryView[],
  budget: BudgetRow[],
  actual: Map<string, number[]>,
  month: number
): BudgetComparison[] {
  const budgetById = new Map(budget.map((b) => [b.categoryId, b.monthly.map(cents)]));
  return categories
    .filter((c) => c.active || budgetById.has(c.id) || actual.has(c.id))
    .map((c) => {
      const b = budgetById.get(c.id) ?? new Array<number>(12).fill(0);
      const a = actual.get(c.id) ?? new Array<number>(12).fill(0);
      const sum = (xs: number[], n: number) => xs.slice(0, n).reduce((s, x) => s + x, 0);
      const annual = sum(b, 12);
      const yearActual = sum(a, 12);
      const m = { budget: b[month - 1] ?? 0, actual: a[month - 1] ?? 0 };
      const y = { budget: sum(b, month), actual: sum(a, month) };
      const out = c.direction === "OUT";
      return {
        categoryId: c.id,
        name: c.name,
        direction: c.direction,
        annualBudget: euros(annual),
        month: { budget: euros(m.budget), actual: euros(m.actual), gap: euros(m.actual - m.budget), ratio: ratio(m.actual, m.budget) },
        ytd: { budget: euros(y.budget), actual: euros(y.actual), gap: euros(y.actual - y.budget), ratio: ratio(y.actual, y.budget) },
        yearActual: euros(yearActual),
        yearRatio: ratio(yearActual, annual),
        overBudget: out && annual > 0 && yearActual > annual,
        warning: out && annual > 0 && yearActual <= annual && yearActual >= annual * BUDGET_WARNING_RATIO,
      };
    });
}

export async function budgetVsActual(churchId: string, year: number, month: number, lines?: RawLine[]) {
  const [categories, budget] = await Promise.all([listCategories(churchId), getBudget(churchId, year)]);
  const all = lines ?? (await loadAllLines(churchId, await listAccounts(churchId)));
  return compareBudget(categories, budget, actualByCategory(all, year), month);
}

