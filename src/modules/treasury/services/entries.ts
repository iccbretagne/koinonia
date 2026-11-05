import type { TreasuryEntry } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { AUTOMATIC_SYSTEMS, type EntryInput } from "../schemas";
import { getActiveTreasuryAccount } from "./accounts";
import { assertOpen } from "./closures";
import { audit, cents, db, fromIsoDate, toIsoDate, type TreasuryActor } from "./common";
import { storeReceipt } from "./receipts";

/**
 * Lignes du registre de trésorerie (spec 076). Toute écriture vérifie le mois (clôture), le
 * compte (actif, date de départ), la catégorie (active, du même sens, choisissable à la main) et
 * l'objet des offrandes spéciales ; elle est journalisée avec les valeurs avant et après.
 */

/** Valeurs journalisées d'une ligne. */
export function entrySnapshot(e: TreasuryEntry) {
  return {
    accountId: e.accountId,
    kind: e.kind,
    direction: e.direction,
    categoryId: e.categoryId,
    purposeId: e.purposeId,
    method: e.method,
    amount: Number(e.amount),
    date: toIsoDate(e.date),
    label: e.label,
    thirdParty: e.thirdParty,
    depositRef: e.depositRef,
    receiptName: e.receiptName,
  };
}

/** Compte, date, catégorie et objet d'une saisie à la main. Renvoie l'objet retenu. */
async function validateInput(churchId: string, input: EntryInput): Promise<string | null> {
  const account = await getActiveTreasuryAccount(churchId, input.accountId);
  if (input.date < toIsoDate(account.openingDate)) {
    throw new ApiError(400, "La date est antérieure au solde de départ de ce compte");
  }
  const prisma = await db();
  const category = await prisma.treasuryCategory.findFirst({ where: { id: input.categoryId, churchId } });
  if (!category) throw new ApiError(400, "Catégorie introuvable");
  if (!category.active) throw new ApiError(400, "Cette catégorie est désactivée");
  if (category.direction !== input.direction) {
    throw new ApiError(400, input.direction === "IN" ? "Choisissez une catégorie d'entrée" : "Choisissez une catégorie de sortie");
  }
  if (category.system && AUTOMATIC_SYSTEMS.includes(category.system)) {
    throw new ApiError(400, `« ${category.name} » se saisit depuis la remise ou est repris automatiquement`);
  }
  if (category.system !== "SPECIAL_OFFERING") return null;
  if (!input.purposeId) throw new ApiError(400, "Indiquez l'objet de l'offrande spéciale");
  const purpose = await prisma.treasuryPurpose.findFirst({ where: { id: input.purposeId, churchId } });
  if (!purpose) throw new ApiError(400, "Objet introuvable");
  if (!purpose.active) throw new ApiError(400, "Cet objet est désactivé");
  return purpose.id;
}

/** Même compte, date, sens, catégorie et montant qu'une ligne existante : confirmation exigée. */
async function assertNotDuplicate(churchId: string, input: EntryInput, selfId?: string) {
  if (input.confirmDuplicate) return;
  const prisma = await db();
  const twin = await prisma.treasuryEntry.findFirst({
    where: {
      churchId,
      accountId: input.accountId,
      direction: input.direction,
      categoryId: input.categoryId,
      date: fromIsoDate(input.date),
      amount: input.amount,
      deletedAt: null,
      ...(selfId ? { NOT: { id: selfId } } : {}),
    },
    select: { id: true },
  });
  if (twin) {
    throw new ApiError(
      409,
      "Une ligne identique existe déjà (même date, montant, compte et catégorie). Confirmez pour l'enregistrer quand même."
    );
  }
}

function fieldsOf(input: EntryInput, purposeId: string | null) {
  return {
    accountId: input.accountId,
    direction: input.direction,
    categoryId: input.categoryId,
    purposeId,
    method: input.method,
    amount: input.amount,
    date: fromIsoDate(input.date),
    label: input.label,
    thirdParty: input.thirdParty,
  };
}

export async function createEntry(churchId: string, input: EntryInput, file: File | null, actor: TreasuryActor) {
  await assertOpen(churchId, input.date);
  const purposeId = await validateInput(churchId, input);
  await assertNotDuplicate(churchId, input);
  const receipt = file ? await storeReceipt(churchId, file) : null;
  const prisma = await db();
  const entry = await prisma.treasuryEntry.create({
    data: { churchId, ...fieldsOf(input, purposeId), ...receipt, createdById: actor.id, updatedById: actor.id },
  });
  await audit(churchId, actor, "CREATE", "TreasuryEntry", entry.id, { after: entrySnapshot(entry) });
  return entry;
}

/** Église d'une ligne (y compris supprimée), `null` si elle n'existe pas. */
export async function getEntryChurchId(entryId: string): Promise<string | null> {
  const prisma = await db();
  const entry = await prisma.treasuryEntry.findUnique({ where: { id: entryId }, select: { churchId: true } });
  return entry?.churchId ?? null;
}

export async function loadTreasuryEntry(entryId: string) {
  const prisma = await db();
  const entry = await prisma.treasuryEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  return entry;
}

/** Corrige une ligne ordinaire ; `file` remplace le justificatif s'il est fourni. */
export async function updateEntry(entryId: string, input: EntryInput, file: File | null, actor: TreasuryActor) {
  const existing = await loadTreasuryEntry(entryId);
  if (existing.kind === "TRANSFER") throw new ApiError(400, "Un transfert se corrige depuis le transfert lui-même");
  if (existing.kind === "DEPOSIT") throw new ApiError(400, "Une remise ne se corrige pas : supprimez-la et refaites-la");
  await assertOpen(existing.churchId, toIsoDate(existing.date), input.date);

  const prisma = await db();
  const cheques = await prisma.treasuryCheque.count({ where: { entryId } });
  if (
    cheques > 0 &&
    (input.method !== existing.method ||
      input.accountId !== existing.accountId ||
      cents(input.amount) !== cents(Number(existing.amount)))
  ) {
    throw new ApiError(400, "Le montant, le moyen et le compte d'une ligne de chèques suivent ses chèques : supprimez-la et ressaisissez la collecte");
  }
  const purposeId = await validateInput(existing.churchId, input);
  await assertNotDuplicate(existing.churchId, input, entryId);
  const receipt = file ? await storeReceipt(existing.churchId, file) : null;

  const entry = await prisma.treasuryEntry.update({
    where: { id: entryId },
    data: { ...fieldsOf(input, purposeId), ...receipt, updatedById: actor.id },
  });
  await audit(existing.churchId, actor, "UPDATE", "TreasuryEntry", entryId, {
    before: entrySnapshot(existing),
    after: entrySnapshot(entry),
  });
  return entry;
}

/**
 * Supprime logiquement une ligne (elle reste dans l'historique). Un transfert est supprimé avec
 * ses deux jambes ; une remise remet ses chèques en caisse ; une ligne de chèques déjà remis est
 * refusée.
 */
export async function deleteEntry(entryId: string, actor: TreasuryActor, now = new Date()) {
  const existing = await loadTreasuryEntry(entryId);
  const prisma = await db();
  const group =
    existing.kind === "TRANSFER" && existing.transferGroupId
      ? await prisma.treasuryEntry.findMany({ where: { transferGroupId: existing.transferGroupId, deletedAt: null } })
      : [existing];
  await assertOpen(existing.churchId, ...group.map((e) => toIsoDate(e.date)));

  const deposited = await prisma.treasuryCheque.count({ where: { entryId, depositEntryId: { not: null } } });
  if (deposited > 0) throw new ApiError(400, "Des chèques de cette ligne ont déjà été remis : supprimez d'abord la remise");

  await prisma.$transaction(async (tx) => {
    if (existing.kind === "DEPOSIT") {
      await tx.treasuryCheque.updateMany({ where: { depositEntryId: entryId }, data: { depositEntryId: null } });
    }
    await tx.treasuryEntry.updateMany({
      where: { id: { in: group.map((e) => e.id) } },
      data: { deletedAt: now, deletedById: actor.id },
    });
  });
  await Promise.all(
    group.map((e) => audit(existing.churchId, actor, "DELETE", "TreasuryEntry", e.id, { before: entrySnapshot(e) }))
  );
}

/** Historique d'une ligne (création, corrections, suppression). */
export async function getEntryHistory(entryId: string) {
  const prisma = await db();
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "TreasuryEntry", entityId: entryId },
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
