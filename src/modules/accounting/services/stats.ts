import { prisma } from "@/lib/prisma";

/**
 * Statistiques comptables d'une église (spec comptabilité) : vue d'ensemble, répartition par
 * statut, type et département sur la période, tendance des 12 derniers mois et paiements en
 * retard. Partagé par la page /accounting/stats (rendu initial) et GET /api/accounting/stats.
 */

export type Period = "month" | "quarter" | "year";

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  if (period === "month") {
    from.setDate(1);
  } else if (period === "quarter") {
    from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  } else {
    from.setMonth(0, 1);
  }
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

type StatsPayment = { amount: unknown; releasedAt: Date | null; releasedAmount: unknown };
type StatsRequest = {
  status: string;
  type: string;
  amount: unknown;
  departmentId: string | null;
  department: { name: string } | null;
  payments: StatsPayment[];
};

const sumAmounts = (requests: StatsRequest[]) => requests.reduce((s, r) => s + Number(r.amount), 0);

/** Montant effectivement versé : le montant libéré s'il diffère, sinon le montant prévu. */
const releasedTotal = (payments: StatsPayment[]) =>
  payments
    .filter((p) => p.releasedAt !== null)
    .reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0);

function overview(requests: StatsRequest[]) {
  const withStatus = (...statuses: string[]) => requests.filter((r) => statuses.includes(r.status));
  const eligibleCount = requests.length - withStatus("CANCELLED").length;
  return {
    totalRequests: requests.length,
    totalAmount: sumAmounts(requests.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED")),
    approvedAmount: sumAmounts(withStatus("APPROVED")),
    releasedAmount: releasedTotal(requests.flatMap((r) => r.payments)),
    pendingAmount: sumAmounts(withStatus("SUBMITTED", "PROCESSING")),
    rejectedCount: withStatus("REJECTED").length,
    cancelledCount: withStatus("CANCELLED").length,
    approvalRate:
      eligibleCount > 0 ? Math.round((withStatus("APPROVED").length / eligibleCount) * 100) : null,
  };
}

/** Nombre et montant par valeur de clé, dans l'ordre de première apparition. */
function countAndAmountBy(requests: StatsRequest[], keyOf: (r: StatsRequest) => string) {
  const totals = new Map<string, { count: number; amount: number }>();
  for (const r of requests) {
    const entry = totals.get(keyOf(r)) ?? { count: 0, amount: 0 };
    entry.count++;
    entry.amount += Number(r.amount);
    totals.set(keyOf(r), entry);
  }
  return [...totals];
}

function byDepartment(requests: StatsRequest[]) {
  const deptMap = new Map<string, { name: string; count: number; amount: number; released: number }>();
  for (const r of requests) {
    const key = r.departmentId ?? "__personal__";
    const entry = deptMap.get(key) ?? { name: r.department?.name ?? "Personnel", count: 0, amount: 0, released: 0 };
    entry.count++;
    entry.amount += Number(r.amount);
    entry.released += releasedTotal(r.payments);
    deptMap.set(key, entry);
  }
  return [...deptMap.values()].sort((a, b) => b.amount - a.amount);
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Montants soumis et versés sur les 12 mois commençant à `since`. */
function monthlyTrend(
  since: Date,
  trendRequests: { createdAt: Date; amount: unknown }[],
  trendPayments: StatsPayment[]
) {
  const months = new Map<string, { submitted: number; released: number }>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    months.set(monthKey(d), { submitted: 0, released: 0 });
  }
  for (const r of trendRequests) {
    const entry = months.get(monthKey(r.createdAt));
    if (entry) entry.submitted += Number(r.amount);
  }
  for (const p of trendPayments) {
    const entry = p.releasedAt ? months.get(monthKey(p.releasedAt)) : undefined;
    if (entry) entry.released += Number(p.releasedAmount ?? p.amount);
  }
  return [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}


/** Statistiques de la période (année en cours par défaut) pour l'église. */
export async function computeAccountingStats(churchId: string, period: Period = "year") {
  const { from, to } = getPeriodRange(period);

  // ── Demandes de la période ────────────────────────────────────────────────
  const requests = await prisma.financialRequest.findMany({
    where: { churchId, createdAt: { gte: from, lte: to } },
    include: {
      department: { select: { id: true, name: true } },
      payments: {
        select: { amount: true, releasedAt: true, releasedAmount: true, scheduledDate: true },
      },
    },
  });

  // ── Tendance mensuelle (12 derniers mois, indépendant de la période) ──────
  const trendSince = new Date();
  trendSince.setMonth(trendSince.getMonth() - 11);
  trendSince.setDate(1);
  trendSince.setHours(0, 0, 0, 0);

  const [trendRequests, trendPayments] = await Promise.all([
    prisma.financialRequest.findMany({
      where: { churchId, createdAt: { gte: trendSince } },
      select: { createdAt: true, amount: true },
    }),
    prisma.financialPayment.findMany({
      where: {
        request: { churchId },
        releasedAt: { gte: trendSince, not: null },
      },
      select: { releasedAt: true, releasedAmount: true, amount: true },
    }),
  ]);

  // ── Paiements en retard ───────────────────────────────────────────────────
  const overdueRaw = await prisma.financialPayment.findMany({
    where: {
      request: { churchId },
      scheduledDate: { lt: new Date() },
      releasedAt: null,
    },
    include: { request: { select: { id: true, label: true } } },
    orderBy: { scheduledDate: "asc" },
  });
  const overduePayments = overdueRaw.map((p) => ({
    id: p.id,
    requestId: p.request.id,
    requestLabel: p.request.label,
    amount: Number(p.amount),
    scheduledDate: p.scheduledDate.toISOString(),
  }));

  return {
    period,
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    overview: overview(requests),
    byStatus: countAndAmountBy(requests, (r) => r.status).map(([status, v]) => ({ status, ...v })),
    byType: countAndAmountBy(requests, (r) => r.type).map(([type, v]) => ({ type, ...v })),
    byDepartment: byDepartment(requests),
    byMonth: monthlyTrend(trendSince, trendRequests, trendPayments),
    overduePayments,
  };
}
