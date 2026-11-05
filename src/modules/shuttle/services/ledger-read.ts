import type {
  ShuttleEntryKind,
  ShuttleExpenseCategory,
  ShuttlePaymentMethod,
} from "@/generated/prisma/enums";
import {
  getRequestsProgress,
  listDepartmentExpenseReports,
  listReleasedBudgetAdvances,
} from "@/modules/accounting";
import { getShuttleDepartments } from "../auth";
import { AUTHOR_EDIT_WINDOW_HOURS, type LedgerQuery, type ReimbursementStatus } from "../schemas";

/**
 * Lecture du registre de la navette (spec 073) : relevé chronologique avec solde courant, totaux
 * d'une période, répartitions, cautions en cours, avances personnelles et liens avec la
 * comptabilité. Tout est calculé à la lecture (quelques centaines de lignes par an) : une ligne
 * antidatée, corrigée ou supprimée laisse toujours des soldes justes.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
export const fromIsoDate = (s: string) => new Date(`${s}T00:00:00Z`);
const cents = (n: number) => Math.round(n * 100);
const euros = (c: number) => c / 100;

export interface ReimbursementInfo {
  requestId: string;
  status: ReimbursementStatus;
  paid: number;
  rejectionReason: string | null;
}

export interface LedgerLine {
  id: string;
  /** `accounting` : avance de budget versée, lue dans la comptabilité (lien B), en lecture seule. */
  source: "ledger" | "accounting";
  kind: ShuttleEntryKind | "BUDGET_ADVANCE";
  category: ShuttleExpenseCategory | null;
  amount: number;
  date: string;
  label: string | null;
  vendor: string | null;
  paymentMethod: ShuttlePaymentMethod | null;
  /** Abondement remis depuis un compte de trésorerie (spec 076). */
  treasuryAccountId: string | null;
  liters: number | null;
  kilometers: number | null;
  personalAdvance: boolean;
  rental: { id: string; label: string } | null;
  returnOfId: string | null;
  returned: boolean;
  depositRetainedAt: string | null;
  depositRetainedNote: string | null;
  hasReceipt: boolean;
  receiptName: string | null;
  receiptMime: string | null;
  flagNote: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Fin du délai de correction par l'auteur. */
  authorEditUntil: string;
  reimbursement: ReimbursementInfo | null;
  sourceRequestId: string | null;
  /** Demande d'origine d'une avance de budget (lien B). */
  requestId: string | null;
  runningBalance: number;
}

export interface LedgerSummary {
  balanceToDate: number;
  period: { from: string | null; to: string | null; openingBalance: number; inflows: number; outflows: number; net: number; closingBalance: number };
  entries: LedgerLine[];
  byCategory: { category: ShuttleExpenseCategory; total: number }[];
  byMonth: { month: string; inflows: number; outflows: number }[];
  byRental: { id: string; label: string; startDate: string; cost: number }[];
  outstandingDeposits: { id: string; date: string; amount: number; vendor: string | null; rental: string | null; ageDays: number }[];
  personalAdvances: LedgerLine[];
  unlinkedExpenseReports: {
    id: string;
    label: string;
    amount: number;
    date: string;
    status: string;
    submittedBy: string;
    hasReceipt: boolean;
  }[];
  hasOpeningBalance: boolean;
}

export function reimbursementStatus(req: {
  status: string;
  amount: unknown;
  payments: { releasedAt: Date | null; releasedAmount: unknown }[];
}): { status: ReimbursementStatus; paid: number } {
  const paid = euros(
    req.payments.filter((p) => p.releasedAt).reduce((sum, p) => sum + cents(Number(p.releasedAmount ?? 0)), 0)
  );
  switch (req.status) {
    case "SUBMITTED":
      return { status: "REQUESTED", paid };
    case "PROCESSING":
      return { status: "PROCESSING", paid };
    case "REJECTED":
      return { status: "REJECTED", paid };
    case "CANCELLED":
      return { status: "CANCELLED", paid };
    default:
      if (cents(paid) >= cents(Number(req.amount))) return { status: "PAID", paid };
      return { status: paid > 0 ? "PARTIALLY_PAID" : "APPROVED", paid };
  }
}

/** Une demande de remboursement « en cours » fige la ligne pour le membre. */
export function isActiveReimbursement(status: ReimbursementStatus | null | undefined): boolean {
  return !!status && status !== "REJECTED" && status !== "CANCELLED";
}

function rentalLabel(r: { vendor: string; vehicle: string | null; startDate: Date }) {
  const day = r.startDate.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  return [r.vendor, r.vehicle, day].filter(Boolean).join(" · ");
}

async function loadBudgetAdvanceLines(churchId: string): Promise<LedgerLine[]> {
  const departments = await getShuttleDepartments(churchId);
  const releases = await listReleasedBudgetAdvances(
    churchId,
    departments.map((d) => d.id)
  );
  return releases.map((p) => {
    const releasedAt = p.releasedAt!;
    return {
      id: `advance-${p.id}`,
      source: "accounting" as const,
      kind: "BUDGET_ADVANCE" as const,
      category: null,
      amount: Number(p.releasedAmount ?? p.amount),
      date: toIsoDate(releasedAt),
      label: p.request.label,
      vendor: null,
      paymentMethod: null,
      treasuryAccountId: null,
      liters: null,
      kilometers: null,
      personalAdvance: false,
      rental: null,
      returnOfId: null,
      returned: false,
      depositRetainedAt: null,
      depositRetainedNote: null,
      hasReceipt: false,
      receiptName: null,
      receiptMime: null,
      flagNote: null,
      createdBy: null,
      createdAt: releasedAt.toISOString(),
      updatedAt: releasedAt.toISOString(),
      authorEditUntil: releasedAt.toISOString(),
      reimbursement: null,
      sourceRequestId: null,
      requestId: p.request.id,
      runningBalance: 0,
    };
  });
}

/** Solde à date : lignes non supprimées + avances de budget versées (lien B). */
export async function currentBalance(churchId: string): Promise<number> {
  const prisma = await db();
  const agg = await prisma.shuttleEntry.aggregate({
    where: { churchId, deletedAt: null },
    _sum: { amount: true },
  });
  const advances = await loadBudgetAdvanceLines(churchId);
  return euros(cents(Number(agg._sum.amount ?? 0)) + advances.reduce((s, l) => s + cents(l.amount), 0));
}

type LedgerRow = Awaited<ReturnType<typeof loadRows>>[number];
type Progress = Awaited<ReturnType<typeof getRequestsProgress>>[number];

async function loadRows(churchId: string) {
  const prisma = await db();
  return prisma.shuttleEntry.findMany({
    where: { churchId, deletedAt: null },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      rental: { select: { id: true, vendor: true, vehicle: true, startDate: true } },
      returnedBy: { select: { id: true, deletedAt: true } },
    },
  });
}

function toLedgerLine(r: LedgerRow, progressById: Map<string, Progress>): LedgerLine {
  const req = r.reimbursementRequestId ? progressById.get(r.reimbursementRequestId) : undefined;
  const reimbursement: ReimbursementInfo | null = req
    ? { requestId: req.id, ...reimbursementStatus(req), rejectionReason: req.rejectionReason }
    : null;
  return {
    id: r.id,
    source: "ledger",
    kind: r.kind,
    category: r.category,
    amount: Number(r.amount),
    date: toIsoDate(r.date),
    label: r.label,
    vendor: r.vendor,
    paymentMethod: r.paymentMethod,
    treasuryAccountId: r.treasuryAccountId,
    liters: r.liters === null ? null : Number(r.liters),
    kilometers: r.kilometers,
    personalAdvance: r.personalAdvance,
    rental: r.rental ? { id: r.rental.id, label: rentalLabel(r.rental) } : null,
    returnOfId: r.returnOfId,
    returned: !!r.returnedBy && !r.returnedBy.deletedAt,
    depositRetainedAt: r.depositRetainedAt?.toISOString() ?? null,
    depositRetainedNote: r.depositRetainedNote,
    hasReceipt: !!r.receiptKey,
    receiptName: r.receiptName,
    receiptMime: r.receiptMime,
    flagNote: r.flagNote,
    createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name ?? r.createdBy.email ?? "—" } : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    authorEditUntil: new Date(r.createdAt.getTime() + AUTHOR_EDIT_WINDOW_HOURS * 3_600_000).toISOString(),
    reimbursement,
    sourceRequestId: r.sourceRequestId,
    requestId: null,
    runningBalance: 0,
  };
}

/** Sorties par type et entrées/sorties par mois, sur les lignes d'une période. */
function periodBreakdowns(lines: readonly LedgerLine[]) {
  const categoryTotals = new Map<ShuttleExpenseCategory, number>();
  const monthTotals = new Map<string, { inflows: number; outflows: number }>();
  for (const l of lines) {
    if (l.kind === "EXPENSE" && l.category) {
      categoryTotals.set(l.category, (categoryTotals.get(l.category) ?? 0) - cents(l.amount));
    }
    const month = l.date.slice(0, 7);
    const m = monthTotals.get(month) ?? { inflows: 0, outflows: 0 };
    if (l.amount > 0) m.inflows += cents(l.amount);
    else m.outflows -= cents(l.amount);
    monthTotals.set(month, m);
  }
  return { categoryTotals, monthTotals };
}

/** Coût d'une location : ses dépenses hors caution, moins les remboursements du loueur. */
function rentalCosts(rows: readonly LedgerRow[]) {
  const rentalCost = new Map<string, { label: string; startDate: string; cost: number }>();
  for (const r of rows) {
    if (!r.rental) continue;
    const entry = rentalCost.get(r.rental.id) ?? {
      label: rentalLabel(r.rental),
      startDate: toIsoDate(r.rental.startDate),
      cost: 0,
    };
    if ((r.kind === "EXPENSE" && r.category !== "DEPOSIT") || r.kind === "VENDOR_REFUND") {
      entry.cost -= cents(Number(r.amount));
    }
    rentalCost.set(r.rental.id, entry);
  }
  return rentalCost;
}

/** Relevé complet et synthèses d'une période. */
export async function getLedger(
  churchId: string,
  query: LedgerQuery,
  viewer: { userId: string; manager: boolean },
  now = new Date()
): Promise<LedgerSummary> {
  const rows = await loadRows(churchId);

  const progress = await getRequestsProgress(
    rows.map((r) => r.reimbursementRequestId).filter((id): id is string => !!id)
  );
  const progressById = new Map(progress.map((p) => [p.id, p]));

  const ledgerLines = rows.map((r) => toLedgerLine(r, progressById));

  const all = [...ledgerLines, ...(await loadBudgetAdvanceLines(churchId))].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );
  let running = 0;
  for (const line of all) {
    running += cents(line.amount);
    line.runningBalance = euros(running);
  }
  const balanceToDate = euros(running);

  const from = query.from ?? null;
  const to = query.to ?? null;
  const inPeriod = all.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
  const openingCents = all.filter((l) => from && l.date < from).reduce((s, l) => s + cents(l.amount), 0);
  const inflowCents = inPeriod.filter((l) => l.amount > 0).reduce((s, l) => s + cents(l.amount), 0);
  const outflowCents = inPeriod.filter((l) => l.amount < 0).reduce((s, l) => s - cents(l.amount), 0);

  const { categoryTotals, monthTotals } = periodBreakdowns(inPeriod);

  const rentalCost = rentalCosts(rows);

  const outstandingDeposits = ledgerLines
    .filter((l) => l.kind === "EXPENSE" && l.category === "DEPOSIT" && !l.returned && !l.depositRetainedAt)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({
      id: l.id,
      date: l.date,
      amount: -l.amount,
      vendor: l.vendor,
      rental: l.rental?.label ?? null,
      ageDays: Math.max(0, Math.floor((now.getTime() - fromIsoDate(l.date).getTime()) / DAY_MS)),
    }));

  let unlinkedExpenseReports: LedgerSummary["unlinkedExpenseReports"] = [];
  if (viewer.manager) {
    const linked = new Set(rows.flatMap((r) => [r.reimbursementRequestId, r.sourceRequestId]).filter(Boolean));
    const departments = await getShuttleDepartments(churchId);
    const reports = await listDepartmentExpenseReports(
      churchId,
      departments.map((d) => d.id)
    );
    unlinkedExpenseReports = reports
      .filter((r) => !linked.has(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        amount: Number(r.amount),
        date: toIsoDate(r.createdAt),
        status: r.status,
        submittedBy: r.submittedBy.name ?? r.submittedBy.email ?? "—",
        hasReceipt: r.attachments.length > 0,
      }));
  }

  const displayed = inPeriod.filter(
    (l) =>
      (!query.category || l.category === query.category) &&
      (!query.authorId || l.createdBy?.id === query.authorId) &&
      (!query.rentalId || l.rental?.id === query.rentalId) &&
      (!query.flagged || !!l.flagNote)
  );

  return {
    balanceToDate,
    period: {
      from,
      to,
      openingBalance: euros(openingCents),
      inflows: euros(inflowCents),
      outflows: euros(outflowCents),
      net: euros(inflowCents - outflowCents),
      closingBalance: euros(openingCents + inflowCents - outflowCents),
    },
    entries: displayed,
    byCategory: [...categoryTotals].map(([category, total]) => ({ category, total: euros(total) })).sort((a, b) => b.total - a.total),
    byMonth: [...monthTotals]
      .map(([month, m]) => ({ month, inflows: euros(m.inflows), outflows: euros(m.outflows) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byRental: [...rentalCost]
      .map(([id, r]) => ({ id, label: r.label, startDate: r.startDate, cost: euros(r.cost) }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    outstandingDeposits,
    personalAdvances: inPeriod.filter((l) => l.personalAdvance),
    unlinkedExpenseReports,
    hasOpeningBalance: rows.some((r) => r.kind === "OPENING_BALANCE"),
  };
}

/** Historique d'une ligne (journal d'audit), du plus récent au plus ancien. */
export async function getEntryHistory(entryId: string) {
  const prisma = await db();
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "ShuttleEntry", entityId: entryId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    at: l.createdAt.toISOString(),
    by: l.user?.name ?? l.user?.email ?? "—",
    details: l.details,
  }));
}
