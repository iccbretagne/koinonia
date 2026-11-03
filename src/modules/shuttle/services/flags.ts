import { ApiError } from "@/lib/api-utils";
import { entryTitle, loadShuttleEntry, notifyEntryAuthor, type ShuttleActor } from "./ledger";

/**
 * Signalements et cautions (spec 073) : réservés à la comptabilité. Un signalement n'est pas un
 * refus — la ligne reste comptée ; il est visible par la navette et son auteur est prévenu.
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

export async function flagEntry(entryId: string, note: string, actor: ShuttleActor, now = new Date()) {
  assertManager(actor);
  const entry = await loadShuttleEntry(entryId);
  if (entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  const prisma = await db();
  const updated = await prisma.shuttleEntry.update({
    where: { id: entryId },
    data: { flagNote: note, flaggedAt: now, flaggedById: actor.id },
  });
  await audit(entry.churchId, actor.id, entryId, { flag: note });
  await notifyEntryAuthor(
    entry,
    actor.id,
    "Navette : ligne signalée",
    `La comptabilité a signalé votre ligne « ${entryTitle(entry)} » : ${note}`,
    "SHUTTLE_ENTRY_FLAGGED"
  );
  return updated;
}

export async function clearFlag(entryId: string, actor: ShuttleActor) {
  assertManager(actor);
  const entry = await loadShuttleEntry(entryId);
  const prisma = await db();
  const updated = await prisma.shuttleEntry.update({
    where: { id: entryId },
    data: { flagNote: null, flaggedAt: null, flaggedById: null },
  });
  await audit(entry.churchId, actor.id, entryId, { flag: null, previousFlag: entry.flagNote });
  return updated;
}

/** Caution versée jamais restituée (retenue pour un dommage…) : sort des cautions en cours. */
export async function markDepositRetained(entryId: string, note: string, actor: ShuttleActor, now = new Date()) {
  assertManager(actor);
  const entry = await loadShuttleEntry(entryId);
  if (entry.deletedAt || entry.kind !== "EXPENSE" || entry.category !== "DEPOSIT") {
    throw new ApiError(400, "Seule une caution versée peut être marquée non restituée");
  }
  const prisma = await db();
  const updated = await prisma.shuttleEntry.update({
    where: { id: entryId },
    data: { depositRetainedAt: now, depositRetainedNote: note },
  });
  await audit(entry.churchId, actor.id, entryId, { depositRetained: note });
  return updated;
}
