import { ApiError } from "@/lib/api-utils";
import type { DepositInput } from "../schemas";
import { getActiveTreasuryAccount } from "./accounts";
import { getSystemCategory } from "./categories";
import { assertOpen } from "./closures";
import { audit, cents, db, euros, fromIsoDate, toIsoDate, type TreasuryActor } from "./common";

/**
 * Remise au compte commun (spec 076) : sortie de la caisse, catégorie « Remises au compte
 * commun », avec la référence du bordereau. Les chèques cochés quittent la caisse.
 */

export interface ChequeInHand {
  id: string;
  accountId: string;
  accountName: string;
  number: string | null;
  amount: number;
  count: number;
  date: string;
  label: string;
  categoryName: string | null;
  purposeName: string | null;
}

/** Chèques encore en caisse (non remis, ligne non supprimée). */
export async function listChequesInHand(churchId: string, accountId?: string): Promise<ChequeInHand[]> {
  const prisma = await db();
  const rows = await prisma.treasuryCheque.findMany({
    where: { churchId, depositEntryId: null, entry: { deletedAt: null, ...(accountId ? { accountId } : {}) } },
    include: {
      entry: {
        select: {
          accountId: true,
          date: true,
          label: true,
          account: { select: { name: true } },
          category: { select: { name: true } },
          purpose: { select: { name: true } },
        },
      },
    },
  });
  return rows
    .map((c) => ({
      id: c.id,
      accountId: c.entry.accountId,
      accountName: c.entry.account.name,
      number: c.number,
      amount: Number(c.amount),
      count: c.count,
      date: toIsoDate(c.entry.date),
      label: c.entry.label,
      categoryName: c.entry.category?.name ?? null,
      purposeName: c.entry.purpose?.name ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? "").localeCompare(b.number ?? ""));
}

export async function createDeposit(churchId: string, input: DepositInput, actor: TreasuryActor) {
  await assertOpen(churchId, input.date);
  const account = await getActiveTreasuryAccount(churchId, input.accountId);
  if (input.date < toIsoDate(account.openingDate)) {
    throw new ApiError(400, "La date est antérieure au solde de départ de ce compte");
  }
  const prisma = await db();
  const ids = [...new Set(input.chequeIds)];
  const cheques = ids.length
    ? await prisma.treasuryCheque.findMany({
        where: { id: { in: ids }, churchId },
        include: { entry: { select: { accountId: true, deletedAt: true, date: true } } },
      })
    : [];
  if (cheques.length !== ids.length) throw new ApiError(400, "Chèque introuvable");
  for (const c of cheques) {
    if (c.depositEntryId || c.entry.deletedAt) throw new ApiError(400, "Un chèque coché n'est plus en caisse");
    if (c.entry.accountId !== account.id) throw new ApiError(400, "Un chèque coché n'est pas dans ce compte");
    if (toIsoDate(c.entry.date) > input.date) throw new ApiError(400, "Un chèque coché a été collecté après la date de remise");
  }

  const chequesTotal = cheques.reduce((s, c) => s + cents(Number(c.amount)), 0);
  const total = cents(input.cashAmount) + chequesTotal;
  const category = await getSystemCategory(churchId, "DEPOSIT");
  const chequeCount = cheques.reduce((s, c) => s + c.count, 0);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.treasuryEntry.create({
      data: {
        churchId,
        accountId: account.id,
        kind: "DEPOSIT",
        direction: "OUT",
        categoryId: category.id,
        method: chequeCount > 0 && input.cashAmount === 0 ? "CHEQUE" : "CASH",
        amount: euros(total),
        date: fromIsoDate(input.date),
        label: `Remise au compte commun · bordereau ${input.ref}`,
        depositRef: input.ref,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    if (ids.length > 0) {
      const { count } = await tx.treasuryCheque.updateMany({
        where: { id: { in: ids }, depositEntryId: null },
        data: { depositEntryId: created.id },
      });
      if (count !== ids.length) throw new ApiError(409, "Un chèque vient d'être remis par ailleurs : rechargez la page");
    }
    return created;
  });

  await audit(churchId, actor, "CREATE", "TreasuryEntry", entry.id, {
    after: {
      kind: "DEPOSIT",
      accountId: account.id,
      date: input.date,
      ref: input.ref,
      cash: input.cashAmount,
      cheques: chequeCount,
      chequesTotal: euros(chequesTotal),
      amount: euros(total),
    },
  });
  return { id: entry.id, amount: euros(total), cheques: chequeCount };
}
