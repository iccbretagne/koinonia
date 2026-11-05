import { prisma } from "@/lib/prisma";

/**
 * Compteurs d'usage par jour, pour toute l'instance (spec 075) : aucune donnée de personne,
 * aucune église. Incréments atomiques (`upsert` + `increment`).
 */

export const STAT_FIELDS = [
  "questions",
  "answered",
  "suggested",
  "unanswered",
  "dataAnswers",
  "helpful",
  "notHelpful",
] as const;
export type StatField = (typeof STAT_FIELDS)[number];

export type StatTotals = Record<StatField, number>;

/** Jour courant (UTC, minuit) : une ligne par jour. */
export function statDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function incrementStats(fields: readonly StatField[], now = new Date()) {
  if (fields.length === 0) return;
  const day = statDay(now);
  const create = Object.fromEntries(STAT_FIELDS.map((f) => [f, fields.filter((x) => x === f).length]));
  const update = Object.fromEntries(
    STAT_FIELDS.filter((f) => fields.includes(f)).map((f) => [f, { increment: fields.filter((x) => x === f).length }])
  );
  try {
    await prisma.assistantDailyStat.upsert({ where: { day }, create: { day, ...create }, update });
  } catch {
    // Un compteur ne doit jamais faire échouer une réponse.
  }
}

export interface StatsPeriod {
  from: string;
  to: string;
  totals: StatTotals;
  days: ({ day: string } & StatTotals)[];
  /** Part des avis « Utile » parmi les avis donnés (0–1), `null` sans avis. */
  helpfulRate: number | null;
}

export async function readStats(from?: string, to?: string, now = new Date()): Promise<StatsPeriod> {
  const end = to ? new Date(`${to}T00:00:00Z`) : statDay(now);
  const start = from ? new Date(`${from}T00:00:00Z`) : new Date(end.getTime() - 29 * 86_400_000);
  const rows = await prisma.assistantDailyStat.findMany({
    where: { day: { gte: start, lte: end } },
    orderBy: { day: "asc" },
  });
  const totals = Object.fromEntries(STAT_FIELDS.map((f) => [f, 0])) as StatTotals;
  const days = rows.map((r) => {
    const values = Object.fromEntries(STAT_FIELDS.map((f) => [f, r[f]])) as StatTotals;
    for (const f of STAT_FIELDS) totals[f] += values[f];
    return { day: r.day.toISOString().slice(0, 10), ...values };
  });
  const votes = totals.helpful + totals.notHelpful;
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    totals,
    days,
    helpfulRate: votes > 0 ? totals.helpful / votes : null,
  };
}
