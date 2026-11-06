import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-utils";
import type { TransferInput } from "../schemas";
import { getActiveTreasuryAccount } from "./accounts";
import { assertOpen } from "./closures";
import { audit, db, fromIsoDate, toIsoDate, type TreasuryActor } from "./common";
import { entrySnapshot } from "./entries";

/**
 * Transfert entre deux comptes de l'église (spec 076) : deux lignes (sortie de la source,
 * entrée sur la cible) liées par `transferGroupId`. Les soldes des deux comptes bougent, le total
 * de l'église ne change pas ; ce n'est ni une recette ni une dépense.
 */

async function validate(churchId: string, input: TransferInput) {
  const [from, to] = await Promise.all([
    getActiveTreasuryAccount(churchId, input.fromId),
    getActiveTreasuryAccount(churchId, input.toId),
  ]);
  if (input.date < toIsoDate(from.openingDate) || input.date < toIsoDate(to.openingDate)) {
    throw new ApiError(400, "La date est antérieure au solde de départ d'un des comptes");
  }
  return { from, to };
}

export async function createTransfer(churchId: string, input: TransferInput, actor: TreasuryActor) {
  await assertOpen(churchId, input.date);
  const { from, to } = await validate(churchId, input);
  const groupId = randomUUID();
  const date = fromIsoDate(input.date);
  const prisma = await db();
  const legs = await prisma.$transaction(async (tx) => {
    const common = { churchId, kind: "TRANSFER" as const, method: "CASH" as const, amount: input.amount, date, transferGroupId: groupId, createdById: actor.id, updatedById: actor.id };
    const out = await tx.treasuryEntry.create({
      data: { ...common, accountId: from.id, direction: "OUT", label: input.label ?? `Transfert vers ${to.name}` },
    });
    const inn = await tx.treasuryEntry.create({
      data: { ...common, accountId: to.id, direction: "IN", label: input.label ?? `Transfert depuis ${from.name}` },
    });
    return [out, inn];
  });
  await Promise.all(legs.map((e) => audit(churchId, actor, "CREATE", "TreasuryEntry", e.id, { after: entrySnapshot(e) })));
  return { groupId, ids: legs.map((l) => l.id) };
}

/** Église d'un transfert, `null` s'il n'existe pas. */
export async function getTransferChurchId(groupId: string): Promise<string | null> {
  const prisma = await db();
  const leg = await prisma.treasuryEntry.findFirst({ where: { transferGroupId: groupId, deletedAt: null }, select: { churchId: true } });
  return leg?.churchId ?? null;
}

/** Corrige un transfert : ses deux jambes changent ensemble. */
export async function updateTransfer(groupId: string, input: TransferInput, actor: TreasuryActor) {
  const prisma = await db();
  const legs = await prisma.treasuryEntry.findMany({ where: { transferGroupId: groupId, deletedAt: null } });
  const out = legs.find((l) => l.direction === "OUT");
  const inn = legs.find((l) => l.direction === "IN");
  if (!out || !inn) throw new ApiError(404, "Transfert introuvable");
  const churchId = out.churchId;
  await assertOpen(churchId, toIsoDate(out.date), input.date);
  const { from, to } = await validate(churchId, input);
  const date = fromIsoDate(input.date);
  const updated = await prisma.$transaction([
    prisma.treasuryEntry.update({
      where: { id: out.id },
      data: { accountId: from.id, amount: input.amount, date, label: input.label ?? `Transfert vers ${to.name}`, updatedById: actor.id },
    }),
    prisma.treasuryEntry.update({
      where: { id: inn.id },
      data: { accountId: to.id, amount: input.amount, date, label: input.label ?? `Transfert depuis ${from.name}`, updatedById: actor.id },
    }),
  ]);
  await Promise.all(
    updated.map((e, i) =>
      audit(churchId, actor, "UPDATE", "TreasuryEntry", e.id, { before: entrySnapshot(i === 0 ? out : inn), after: entrySnapshot(e) })
    )
  );
  return { groupId };
}
