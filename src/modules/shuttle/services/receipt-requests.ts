import { ApiError } from "@/lib/api-utils";
import { entryTitle, loadShuttleEntry, notifyEntryAuthor, notifyShuttleUsers, shuttleManagerRecipients, type ShuttleActor } from "./ledger";
import { storeReceipt } from "./receipts";
import { paths } from "@/lib/paths";

/**
 * « Demander le justificatif » (spec 086) : la gestion demande à l'auteur d'une ligne de redéposer
 * son justificatif. L'auteur peut alors le remplacer même hors du délai de 48 h, sans toucher aux
 * autres champs ; le dépôt referme la demande et prévient la compta.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(churchId: string, actorId: string, entryId: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actorId, churchId, action: "UPDATE", entityType: "ShuttleEntry", entityId: entryId, details });
}

function assertManager(actor: ShuttleActor) {
  if (!actor.manager) throw new ApiError(403, "Réservé à la comptabilité");
}

const reset = { receiptRequestedAt: null, receiptRequestLastAt: null, receiptRequestCount: 0, receiptRequestNote: null };

export async function requestReceipt(entryId: string, note: string | undefined, actor: ShuttleActor, now = new Date()) {
  assertManager(actor);
  const entry = await loadShuttleEntry(entryId);
  if (entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  if (!entry.createdById) throw new ApiError(400, "Cette ligne n'a plus d'auteur à prévenir");
  const cleanNote = note?.trim() || null;
  const reminder = entry.receiptRequestedAt !== null;
  const prisma = await db();
  const updated = await prisma.shuttleEntry.update({
    where: { id: entryId },
    data: {
      receiptRequestedAt: entry.receiptRequestedAt ?? now,
      receiptRequestLastAt: now,
      receiptRequestCount: { increment: 1 },
      receiptRequestNote: cleanNote,
    },
  });
  await audit(entry.churchId, actor.id, entryId, { receiptRequest: reminder ? "reminder" : "request", note: cleanNote });
  await notifyEntryAuthor(
    entry,
    actor.id,
    reminder ? "Navette : justificatif demandé (relance)" : "Navette : justificatif demandé",
    `La comptabilité demande le justificatif de votre ligne « ${entryTitle(entry)} »${cleanNote ? ` : ${cleanNote}` : "."}`,
    "SHUTTLE_RECEIPT_REQUESTED"
  );
  return updated;
}

export async function cancelReceiptRequest(entryId: string, actor: ShuttleActor) {
  assertManager(actor);
  const entry = await loadShuttleEntry(entryId);
  if (!entry.receiptRequestedAt) throw new ApiError(400, "Aucun justificatif n'est demandé");
  const prisma = await db();
  const updated = await prisma.shuttleEntry.update({ where: { id: entryId }, data: reset });
  await audit(entry.churchId, actor.id, entryId, { receiptRequest: "cancelled", previousNote: entry.receiptRequestNote });
  return updated;
}

/** Dépôt par l'auteur seul, hors délai de 48 h ; seul le justificatif change. */
export async function submitRequestedReceipt(entryId: string, file: File, actor: ShuttleActor) {
  const entry = await loadShuttleEntry(entryId);
  if (entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  if (entry.createdById !== actor.id) throw new ApiError(403, "Seul l'auteur de la ligne peut déposer ce justificatif");
  if (!entry.receiptRequestedAt) throw new ApiError(400, "Aucun justificatif n'est demandé");

  const receipt = await storeReceipt(entry.churchId, file);
  const prisma = await db();
  const taken = await prisma.shuttleEntry.updateMany({
    where: { id: entryId, receiptRequestedAt: { not: null } },
    data: { ...receipt, ...reset, updatedById: actor.id },
  });
  if (taken.count === 0) {
    const { deleteFile } = await import("@/lib/file-storage");
    await deleteFile(receipt.receiptKey).catch(() => {});
    throw new ApiError(400, "Aucun justificatif n'est demandé");
  }
  await audit(entry.churchId, actor.id, entryId, { receiptRequest: "submitted", receiptName: receipt.receiptName });

  const recipients = (await shuttleManagerRecipients(entry.churchId)).filter((id) => id !== actor.id);
  await notifyShuttleUsers(
    recipients,
    "Navette : justificatif déposé",
    `${actor.name} a déposé le justificatif de « ${entryTitle(entry)} ».`,
    paths.accounting.navette({ ligne: entryId }),
    "SHUTTLE_RECEIPT_SUBMITTED"
  );
  return { id: entryId };
}
