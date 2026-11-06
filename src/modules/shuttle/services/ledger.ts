import type { Prisma, ShuttleEntry } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { getShuttleDepartments } from "../auth";
import {
  AUTHOR_EDIT_WINDOW_HOURS,
  ENTRY_KIND_LABEL,
  EXPENSE_CATEGORY_LABEL,
  MANAGER_ONLY_KINDS,
  RECEIPT_REQUIRED,
  type EntryInput,
} from "../schemas";
import { currentBalance, fromIsoDate, isActiveReimbursement, reimbursementStatus } from "./ledger-read";
import { storeReceipt, type StoredReceipt } from "./receipts";

/**
 * Écriture du registre de la navette (spec 073) : déclaratif, sans approbation. Chaque mutation
 * est journalisée (avant/après) ; une mutation par un membre de l'équipe prévient la compta ; le
 * franchissement à la baisse du seuil de solde bas alerte la compta et les responsables.
 */

export interface ShuttleActor {
  id: string;
  name: string;
  manager: boolean;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const fmtEuro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Libellé court d'une ligne (« Carburant », « Abondement »…). */
export function entryTitle(entry: Pick<ShuttleEntry, "kind" | "category" | "label">): string {
  if (entry.kind === "EXPENSE" && entry.category) {
    return entry.category === "OTHER" && entry.label ? entry.label : EXPENSE_CATEGORY_LABEL[entry.category];
  }
  return ENTRY_KIND_LABEL[entry.kind];
}

/** Valeurs journalisées d'une ligne (sans les clés internes). */
function snapshot(e: ShuttleEntry) {
  return {
    kind: e.kind,
    category: e.category,
    amount: Number(e.amount),
    date: e.date.toISOString().slice(0, 10),
    label: e.label,
    vendor: e.vendor,
    paymentMethod: e.paymentMethod,
    treasuryAccountId: e.treasuryAccountId,
    liters: e.liters === null ? null : Number(e.liters),
    kilometers: e.kilometers,
    personalAdvance: e.personalAdvance,
    rentalId: e.rentalId,
    returnOfId: e.returnOfId,
    receiptName: e.receiptName,
  };
}

async function audit(
  churchId: string,
  actor: ShuttleActor,
  action: "CREATE" | "UPDATE" | "DELETE",
  entryId: string,
  details: Record<string, unknown>
) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actor.id, churchId, action, entityType: "ShuttleEntry", entityId: entryId, details });
}

/** Comptables de l'église, à défaut ses Admins : la « compta » prévenue par la navette. */
export async function shuttleManagerRecipients(churchId: string): Promise<string[]> {
  const prisma = await db();
  const accountants = await prisma.userChurchRole.findMany({
    where: { churchId, role: "ACCOUNTANT" },
    select: { userId: true },
  });
  if (accountants.length > 0) return [...new Set(accountants.map((a) => a.userId))];
  const admins = await prisma.userChurchRole.findMany({ where: { churchId, role: "ADMIN" }, select: { userId: true } });
  return [...new Set(admins.map((a) => a.userId))];
}

/** Responsables et adjoints des départements Navette de l'église. */
async function shuttleLeaders(churchId: string): Promise<string[]> {
  const departments = await getShuttleDepartments(churchId);
  if (departments.length === 0) return [];
  const prisma = await db();
  const rows = await prisma.userDepartment.findMany({
    where: { departmentId: { in: departments.map((d) => d.id) }, userChurchRole: { churchId } },
    select: { userChurchRole: { select: { userId: true } } },
  });
  return rows.map((r) => r.userChurchRole.userId);
}

async function notify(userIds: string[], title: string, message: string, link: string, type: string) {
  if (userIds.length === 0) return;
  const { notifyUsers } = await import("@/lib/notifications");
  await notifyUsers(userIds, { domain: "shuttle", type, title, message, link });
}

const ACTION_VERB = { CREATE: "déclarée", UPDATE: "modifiée", DELETE: "supprimée" } as const;

/** Prévient la compta d'une mutation faite par un membre de l'équipe (pas par la compta). */
async function notifyManagers(churchId: string, actor: ShuttleActor, entry: ShuttleEntry, action: keyof typeof ACTION_VERB) {
  if (actor.manager) return;
  const recipients = (await shuttleManagerRecipients(churchId)).filter((id) => id !== actor.id);
  const amount = fmtEuro(Math.abs(Number(entry.amount)));
  await notify(
    recipients,
    `Navette : ligne ${ACTION_VERB[action]}`,
    `${entryTitle(entry)} de ${amount} ${ACTION_VERB[action]} par ${actor.name}.`,
    action === "DELETE" ? "/accounting/navette" : `/accounting/navette?ligne=${entry.id}`,
    `SHUTTLE_ENTRY_${action}`
  );
}

/** Alerte au franchissement du seuil à la baisse (pas à chaque ligne sous le seuil). */
async function alertLowBalance(churchId: string, before: number, after: number) {
  const prisma = await db();
  const settings = await prisma.shuttleSettings.findUnique({ where: { churchId }, select: { lowBalanceThreshold: true } });
  if (settings?.lowBalanceThreshold === null || settings?.lowBalanceThreshold === undefined) return;
  const threshold = Number(settings.lowBalanceThreshold);
  if (!(before >= threshold && after < threshold)) return;
  const recipients = [...new Set([...(await shuttleManagerRecipients(churchId)), ...(await shuttleLeaders(churchId))])];
  await notify(
    recipients,
    "Navette : solde bas",
    `Le solde de la navette est de ${fmtEuro(after)}, sous le seuil de ${fmtEuro(threshold)}.`,
    "/accounting/navette",
    "SHUTTLE_LOW_BALANCE"
  );
}

function signedAmount(input: EntryInput): number {
  return input.kind === "EXPENSE" ? -input.amount : input.amount;
}

/** Champs d'une ligne à partir de la saisie (le reste est remis à zéro selon la nature). */
function entryFields(input: EntryInput) {
  return {
    kind: input.kind,
    amount: signedAmount(input),
    date: fromIsoDate(input.date),
    label: input.label,
    category: input.kind === "EXPENSE" ? input.category : null,
    vendor: "vendor" in input ? input.vendor : null,
    paymentMethod: input.kind === "FUNDING" ? input.paymentMethod : null,
    treasuryAccountId: input.kind === "FUNDING" ? (input.treasuryAccountId ?? null) : null,
    liters: input.kind === "EXPENSE" && input.category === "FUEL" ? input.liters : null,
    kilometers: input.kind === "EXPENSE" && input.category === "MILEAGE" ? input.kilometers : null,
    personalAdvance: input.kind === "EXPENSE" ? input.personalAdvance : false,
    rentalId: "rentalId" in input ? input.rentalId : null,
    returnOfId: input.kind === "DEPOSIT_RETURN" ? input.returnOfId : null,
  };
}

async function assertReferences(churchId: string, input: EntryInput, selfId?: string) {
  const prisma = await db();
  if ("rentalId" in input && input.rentalId) {
    const rental = await prisma.shuttleRental.findFirst({ where: { id: input.rentalId, churchId }, select: { id: true } });
    if (!rental) throw new ApiError(400, "Location introuvable");
  }
  if (input.kind === "DEPOSIT_RETURN" && input.returnOfId) {
    const deposit = await prisma.shuttleEntry.findFirst({
      where: { id: input.returnOfId, churchId, deletedAt: null, kind: "EXPENSE", category: "DEPOSIT" },
      select: { id: true, depositRetainedAt: true, returnedBy: { select: { id: true, deletedAt: true } } },
    });
    if (!deposit) throw new ApiError(400, "Caution introuvable");
    if (deposit.depositRetainedAt) throw new ApiError(400, "Cette caution est marquée non restituée");
    if (deposit.returnedBy && deposit.returnedBy.id !== selfId && !deposit.returnedBy.deletedAt) {
      throw new ApiError(400, "Cette caution est déjà restituée");
    }
  }
}

async function assertSingleOpeningBalance(
  tx: Prisma.TransactionClient,
  churchId: string,
  selfId?: string
) {
  // Sérialise par église (verrou sur la ligne de réglages) avant de vérifier l'unicité.
  await tx.shuttleSettings.upsert({ where: { churchId }, create: { churchId }, update: {} });
  const existing = await tx.shuttleEntry.findFirst({
    where: { churchId, kind: "OPENING_BALANCE", deletedAt: null, ...(selfId ? { NOT: { id: selfId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Le solde de départ est déjà saisi : corrigez la ligne existante.");
}

/** Crée une ligne. `file` est le justificatif (photo ou document). */
export async function createEntry(churchId: string, input: EntryInput, file: File | null, actor: ShuttleActor) {
  if (MANAGER_ONLY_KINDS.includes(input.kind) && !actor.manager) {
    throw new ApiError(403, "Réservé à la comptabilité");
  }
  if (RECEIPT_REQUIRED.includes(input.kind) && !file) {
    throw new ApiError(400, "Justificatif obligatoire : prenez une photo ou joignez un document.");
  }
  await assertReferences(churchId, input);
  const receipt: StoredReceipt | null = file ? await storeReceipt(churchId, file) : null;

  const before = await currentBalance(churchId);
  const prisma = await db();
  const entry = await prisma.$transaction(async (tx) => {
    if (input.kind === "OPENING_BALANCE") await assertSingleOpeningBalance(tx, churchId);
    return tx.shuttleEntry.create({
      data: { churchId, ...entryFields(input), ...receipt, createdById: actor.id, updatedById: actor.id },
    });
  });

  await audit(churchId, actor, "CREATE", entry.id, { after: snapshot(entry) });
  await notifyManagers(churchId, actor, entry, "CREATE");
  await alertLowBalance(churchId, before, await currentBalance(churchId));
  return entry;
}

/** Église d'une ligne (y compris supprimée), `null` si elle n'existe pas. */
export async function getEntryChurchId(entryId: string): Promise<string | null> {
  const prisma = await db();
  const entry = await prisma.shuttleEntry.findUnique({ where: { id: entryId }, select: { churchId: true } });
  return entry?.churchId ?? null;
}

/**
 * Une ligne est modifiable par la compta à tout moment ; par son auteur pendant 48 h, tant
 * qu'aucun remboursement n'est en cours sur elle (lien A). Lève 403 sinon.
 */
async function assertCanEdit(entry: ShuttleEntry, actor: ShuttleActor, now: Date) {
  if (entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  if (actor.manager) return;
  if (entry.createdById !== actor.id) throw new ApiError(403, "Seul l'auteur de la ligne ou la comptabilité peut la modifier");
  if (MANAGER_ONLY_KINDS.includes(entry.kind)) throw new ApiError(403, "Réservé à la comptabilité");
  if (now.getTime() - entry.createdAt.getTime() > AUTHOR_EDIT_WINDOW_HOURS * 3_600_000) {
    throw new ApiError(403, "Le délai de 48 heures est dépassé : demandez la correction à la comptabilité.");
  }
  if (entry.reimbursementRequestId) {
    const { getRequestsProgress } = await import("@/modules/accounting");
    const [req] = await getRequestsProgress([entry.reimbursementRequestId]);
    if (req && isActiveReimbursement(reimbursementStatus(req).status)) {
      throw new ApiError(403, "Un remboursement est demandé pour cette ligne : seule la comptabilité peut la modifier.");
    }
  }
}

async function loadEntry(entryId: string) {
  const prisma = await db();
  const entry = await prisma.shuttleEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new ApiError(404, "Ligne introuvable");
  return entry;
}

/** Corrige une ligne (même nature) ; `file` remplace le justificatif s'il est fourni. */
export async function updateEntry(
  entryId: string,
  input: EntryInput,
  file: File | null,
  actor: ShuttleActor,
  now = new Date()
) {
  const existing = await loadEntry(entryId);
  await assertCanEdit(existing, actor, now);
  if (input.kind !== existing.kind) throw new ApiError(400, "La nature d'une ligne ne se change pas");
  if (RECEIPT_REQUIRED.includes(input.kind) && !file && !existing.receiptKey) {
    throw new ApiError(400, "Justificatif obligatoire : prenez une photo ou joignez un document.");
  }
  await assertReferences(existing.churchId, input, existing.id);
  const receipt = file ? await storeReceipt(existing.churchId, file) : null;

  const before = await currentBalance(existing.churchId);
  const prisma = await db();
  const entry = await prisma.$transaction(async (tx) => {
    if (input.kind === "OPENING_BALANCE") await assertSingleOpeningBalance(tx, existing.churchId, existing.id);
    return tx.shuttleEntry.update({
      where: { id: entryId },
      data: { ...entryFields(input), ...receipt, updatedById: actor.id },
    });
  });

  await audit(existing.churchId, actor, "UPDATE", entry.id, { before: snapshot(existing), after: snapshot(entry) });
  await notifyManagers(existing.churchId, actor, entry, "UPDATE");
  await alertLowBalance(existing.churchId, before, await currentBalance(existing.churchId));
  return entry;
}

/** Supprime logiquement une ligne : elle sort des calculs et reste dans l'historique. */
export async function deleteEntry(entryId: string, actor: ShuttleActor, now = new Date()) {
  const existing = await loadEntry(entryId);
  await assertCanEdit(existing, actor, now);

  const before = await currentBalance(existing.churchId);
  const prisma = await db();
  const entry = await prisma.shuttleEntry.update({
    where: { id: entryId },
    data: { deletedAt: now, deletedById: actor.id, returnOfId: null },
  });

  await audit(existing.churchId, actor, "DELETE", entry.id, { before: snapshot(existing) });
  await notifyManagers(existing.churchId, actor, existing, "DELETE");
  await alertLowBalance(existing.churchId, before, await currentBalance(existing.churchId));
}

/** Notifie l'auteur d'une ligne (signalement, remboursement…), s'il n'est pas l'acteur. */
export async function notifyEntryAuthor(entry: ShuttleEntry, actorId: string, title: string, message: string, type: string) {
  if (!entry.createdById || entry.createdById === actorId) return;
  await notify([entry.createdById], title, message, `/accounting/navette?ligne=${entry.id}`, type);
}

export { loadEntry as loadShuttleEntry, fmtEuro };
