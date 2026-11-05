import type {
  TreasuryAccountKind,
  TreasuryCategorySystem,
  TreasuryDirection,
  TreasuryEntryKind,
  TreasuryMethod,
} from "@/generated/prisma/client";
import type { LedgerQuery } from "../schemas";
import { listAccounts, type AccountView } from "./accounts";
import { cents, db, euros, fromIsoDate, toIsoDate } from "./common";
import { ensureDefaults } from "./defaults";

/**
 * Lecture du registre de trésorerie (spec 076). Les soldes ne sont jamais stockés : solde de
 * départ des comptes + lignes non supprimées + mouvements repris (ADR-0027), en centimes.
 *
 * Tous comptes confondus, un transfert n'est ni une entrée ni une sortie (ses deux jambes
 * s'annulent) ; sur un seul compte, il figure dans les entrées ou les sorties, marqué
 * « Transfert ». Dans les deux cas : ouverture + entrées − sorties = clôture.
 */

export type LedgerSource = "treasury" | "accounting" | "shuttle";

export interface LedgerLine {
  id: string;
  source: LedgerSource;
  kind: TreasuryEntryKind;
  accountId: string;
  accountName: string;
  direction: TreasuryDirection;
  categoryId: string | null;
  categoryName: string | null;
  categorySystem: TreasuryCategorySystem | null;
  purposeId: string | null;
  purposeName: string | null;
  method: TreasuryMethod;
  amount: number;
  date: string;
  label: string;
  thirdParty: string | null;
  depositRef: string | null;
  collectionId: string | null;
  transferGroupId: string | null;
  hasReceipt: boolean;
  /** Origine d'une ligne reprise (demande de la comptabilité, ligne de la navette). */
  link: string | null;
  createdAt: string;
  /** Solde du périmètre (compte ou tous comptes) après la ligne. */
  runningBalance: number;
}

export interface PeriodSummary {
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
}

export interface AccountBalance extends AccountView {
  balance: number;
}

export interface LedgerWarning {
  accountId: string;
  accountName: string;
  date: string;
  balance: number;
}

export interface LedgerResult {
  accounts: AccountBalance[];
  total: number;
  period: PeriodSummary;
  lines: LedgerLine[];
  warnings: LedgerWarning[];
}

/** Ligne avant calcul du solde courant. */
export type RawLine = Omit<LedgerLine, "runningBalance">;

const signed = (l: Pick<RawLine, "direction" | "amount">) => (l.direction === "IN" ? 1 : -1) * cents(l.amount);

const byDate = (a: RawLine, b: RawLine) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Calcul pur du registre : soldes par compte, solde courant du périmètre, période et alertes.
 * `lines` contient toutes les lignes de l'église (propres et reprises) ; le filtrage par compte,
 * période, catégorie ou moyen se fait ici.
 */
export function computeLedger(accounts: AccountView[], lines: RawLine[], query: LedgerQuery = {}, today = toIsoDate(new Date())): LedgerResult {
  const sorted = [...lines].sort(byDate);
  const known = new Set(accounts.map((a) => a.id));
  const kept = sorted.filter((l) => known.has(l.accountId));

  // Soldes par compte (à date) et alertes de caisse négative.
  const balances = new Map(accounts.map((a) => [a.id, cents(a.openingBalance)]));
  const warned = new Set<string>();
  const warnings: LedgerWarning[] = [];
  const cash = new Set(accounts.filter((a) => a.kind === ("CASH" satisfies TreasuryAccountKind)).map((a) => a.id));
  for (const l of kept) {
    const next = (balances.get(l.accountId) ?? 0) + signed(l);
    balances.set(l.accountId, next);
    if (next < 0 && cash.has(l.accountId) && !warned.has(l.accountId)) {
      warned.add(l.accountId);
      warnings.push({ accountId: l.accountId, accountName: l.accountName, date: l.date, balance: euros(next) });
    }
  }

  // Périmètre : un compte ou tous.
  const scopeAccounts = query.accountId ? accounts.filter((a) => a.id === query.accountId) : accounts;
  const allAccounts = !query.accountId;
  const scope = kept.filter((l) => !query.accountId || l.accountId === query.accountId);
  const to = query.to ?? today;

  let running = scopeAccounts.reduce((s, a) => s + cents(a.openingBalance), 0);
  let opening = running;
  let inflows = 0;
  let outflows = 0;
  const out: LedgerLine[] = [];
  for (const l of scope) {
    if (l.date > to) break;
    running += signed(l);
    if (query.from && l.date < query.from) {
      opening = running;
      continue;
    }
    const countsInTotals = !(allAccounts && l.kind === "TRANSFER");
    if (countsInTotals) {
      if (l.direction === "IN") inflows += cents(l.amount);
      else outflows += cents(l.amount);
    }
    if (query.categoryId && l.categoryId !== query.categoryId) continue;
    if (query.method && l.method !== query.method) continue;
    out.push({ ...l, runningBalance: euros(running) });
  }

  const accountBalances = accounts.map((a) => ({ ...a, balance: euros(balances.get(a.id) ?? 0) }));
  return {
    accounts: accountBalances,
    total: euros(accountBalances.reduce((s, a) => s + cents(a.balance), 0)),
    period: { opening: euros(opening), inflows: euros(inflows), outflows: euros(outflows), closing: euros(running) },
    lines: out,
    warnings,
  };
}

/** Lignes propres de l'église, au format du registre. */
export async function loadOwnLines(churchId: string): Promise<RawLine[]> {
  const prisma = await db();
  const rows = await prisma.treasuryEntry.findMany({
    where: { churchId, deletedAt: null },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true, system: true } },
      purpose: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    source: "treasury" as const,
    kind: r.kind,
    accountId: r.accountId,
    accountName: r.account.name,
    direction: r.direction,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    categorySystem: r.category?.system ?? null,
    purposeId: r.purposeId,
    purposeName: r.purpose?.name ?? null,
    method: r.method,
    amount: Number(r.amount),
    date: toIsoDate(r.date),
    label: r.label,
    thirdParty: r.thirdParty,
    depositRef: r.depositRef,
    collectionId: r.collectionId,
    transferGroupId: r.transferGroupId,
    hasReceipt: !!r.receiptKey,
    link: null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Toutes les lignes de l'église : propres et reprises (paiements, navette). */
export async function loadAllLines(churchId: string, accounts: AccountView[]): Promise<RawLine[]> {
  const { loadRepriseLines } = await import("./reprises");
  const [own, reprises] = await Promise.all([loadOwnLines(churchId), loadRepriseLines(churchId, accounts)]);
  return [...own, ...reprises];
}

/** Registre de l'église pour un compte ou tous, sur une période. */
export async function getLedger(churchId: string, query: LedgerQuery = {}): Promise<LedgerResult> {
  await ensureDefaults(churchId);
  const accounts = await listAccounts(churchId);
  const lines = await loadAllLines(churchId, accounts);
  return computeLedger(accounts, lines, query);
}

export { fromIsoDate };
