import { ApiError } from "@/lib/api-utils";
import type { TreasuryAccount } from "@/generated/prisma/client";
import type { AccountInput, AccountPatch } from "../schemas";
import { assertOpen } from "./closures";
import { audit, db, fromIsoDate, toIsoDate, type TreasuryActor } from "./common";

/** Comptes de trésorerie de l'église (spec 076) : caisse, coffre, compte en ligne… */

export interface AccountView {
  id: string;
  name: string;
  kind: TreasuryAccount["kind"];
  openingBalance: number;
  openingDate: string;
  archived: boolean;
  sortOrder: number;
}

export function accountView(a: TreasuryAccount): AccountView {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    openingBalance: Number(a.openingBalance),
    openingDate: toIsoDate(a.openingDate),
    archived: !!a.archivedAt,
    sortOrder: a.sortOrder,
  };
}

export async function listAccounts(churchId: string, { includeArchived = true } = {}): Promise<AccountView[]> {
  const prisma = await db();
  const rows = await prisma.treasuryAccount.findMany({
    where: { churchId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(accountView);
}

/**
 * Compte actif de l'église, pour une saisie ou une reprise (paiement, abondement). 400 si le
 * compte n'existe pas dans cette église ou s'il est archivé.
 */
export async function getActiveTreasuryAccount(churchId: string, accountId: string) {
  const prisma = await db();
  const account = await prisma.treasuryAccount.findFirst({ where: { id: accountId, churchId } });
  if (!account) throw new ApiError(400, "Compte de trésorerie introuvable");
  if (account.archivedAt) throw new ApiError(400, "Ce compte de trésorerie est archivé");
  return account;
}

async function assertUniqueName(churchId: string, name: string, selfId?: string) {
  const prisma = await db();
  const existing = await prisma.treasuryAccount.findFirst({
    where: { churchId, name, ...(selfId ? { NOT: { id: selfId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Un compte porte déjà ce nom");
}

export async function createAccount(churchId: string, input: AccountInput, actor: TreasuryActor) {
  await assertUniqueName(churchId, input.name);
  await assertOpen(churchId, input.openingDate);
  const prisma = await db();
  const account = await prisma.treasuryAccount.create({
    data: {
      churchId,
      name: input.name,
      kind: input.kind,
      openingBalance: input.openingBalance,
      openingDate: fromIsoDate(input.openingDate),
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await audit(churchId, actor, "CREATE", "TreasuryAccount", account.id, { after: accountView(account) });
  return accountView(account);
}

/** Église d'un compte, `null` s'il n'existe pas. */
export async function getAccountChurchId(accountId: string): Promise<string | null> {
  const prisma = await db();
  const account = await prisma.treasuryAccount.findUnique({ where: { id: accountId }, select: { churchId: true } });
  return account?.churchId ?? null;
}

export async function updateAccount(accountId: string, patch: AccountPatch, actor: TreasuryActor, now = new Date()) {
  const prisma = await db();
  const existing = await prisma.treasuryAccount.findUnique({ where: { id: accountId } });
  if (!existing) throw new ApiError(404, "Compte introuvable");
  if (patch.name && patch.name !== existing.name) await assertUniqueName(existing.churchId, patch.name, accountId);

  const openingChanged =
    (patch.openingBalance !== undefined && patch.openingBalance !== Number(existing.openingBalance)) ||
    (patch.openingDate !== undefined && patch.openingDate !== toIsoDate(existing.openingDate));
  if (openingChanged) {
    const dates = [toIsoDate(existing.openingDate), ...(patch.openingDate ? [patch.openingDate] : [])];
    await assertOpen(existing.churchId, ...dates);
    if (patch.openingDate) {
      const earlier = await prisma.treasuryEntry.findFirst({
        where: { accountId, deletedAt: null, date: { lt: fromIsoDate(patch.openingDate) } },
        select: { id: true },
      });
      if (earlier) throw new ApiError(400, "Des lignes sont antérieures à cette date de départ");
    }
  }

  const account = await prisma.treasuryAccount.update({
    where: { id: accountId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.openingBalance !== undefined ? { openingBalance: patch.openingBalance } : {}),
      ...(patch.openingDate !== undefined ? { openingDate: fromIsoDate(patch.openingDate) } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...archiveChange(existing, patch.archived, now),
    },
  });
  await audit(existing.churchId, actor, "UPDATE", "TreasuryAccount", accountId, {
    before: accountView(existing),
    after: accountView(account),
  });
  return accountView(account);
}

function archiveChange(existing: TreasuryAccount, archived: boolean | undefined, now: Date) {
  if (archived === undefined || archived === !!existing.archivedAt) return {};
  return { archivedAt: archived ? now : null };
}
