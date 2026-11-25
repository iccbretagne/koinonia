import { ApiError } from "@/lib/api-utils";

/**
 * Archives de la file de la comptabilité (spec 089). Une demande close (validée, tout remis,
 * rien à justifier ni à déposer) est archivée d'office ; la compta peut aussi en archiver une à la
 * main. Dans tous les cas, une demande qui attend une action de la compta reste dans la file.
 */

export interface ArchiveInput {
  status: string;
  archivedAt: Date | string | null;
  pieceRequestedAt: Date | string | null;
  payments: readonly { releasedAt: Date | string | null }[];
  justification: { status: string } | null;
}

/** La compta a quelque chose à faire : traiter, remettre une tranche, vérifier, confirmer un reliquat. */
export function needsAccountingAction(r: ArchiveInput): boolean {
  if (r.status === "SUBMITTED" || r.status === "PROCESSING") return true;
  if (r.payments.some((p) => !p.releasedAt)) return true;
  return r.justification?.status === "SUBMITTED" || r.justification?.status === "RETURN_DUE";
}

/** Rien ne reste ouvert : validée, tout remis, justificatifs soldés ou jamais attendus, aucune pièce demandée. */
export function isRequestClosed(r: ArchiveInput): boolean {
  if (r.status !== "APPROVED" || r.pieceRequestedAt) return false;
  if (r.payments.length === 0 || r.payments.some((p) => !p.releasedAt)) return false;
  return !r.justification || r.justification.status === "SETTLED";
}

export function isRequestArchived(r: ArchiveInput): boolean {
  return !needsAccountingAction(r) && (isRequestClosed(r) || !!r.archivedAt);
}

const ARCHIVABLE = new Set(["APPROVED", "REJECTED", "CANCELLED"]);

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

/** Archive (ou désarchive) une demande à la main ; journalisé. */
export async function setRequestArchived(requestId: string, archived: boolean, actor: { id: string; churchId: string }) {
  const prisma = await db();
  const existing = await prisma.financialRequest.findUnique({
    where: { id: requestId },
    select: { churchId: true, status: true, archivedAt: true },
  });
  if (existing?.churchId !== actor.churchId) throw new ApiError(404, "Demande introuvable");
  if (archived && !ARCHIVABLE.has(existing.status)) {
    throw new ApiError(400, "Seule une demande validée, rejetée ou annulée peut être archivée");
  }
  if (archived === !!existing.archivedAt) return prisma.financialRequest.findUniqueOrThrow({ where: { id: requestId } });

  const updated = await prisma.financialRequest.update({
    where: { id: requestId },
    data: archived ? { archivedAt: new Date(), archivedById: actor.id } : { archivedAt: null, archivedById: null },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actor.id,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: "FinancialRequest",
    entityId: requestId,
    details: { action: archived ? "archive" : "unarchive" },
  });
  return updated;
}
