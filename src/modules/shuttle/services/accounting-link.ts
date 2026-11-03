import { ApiError } from "@/lib/api-utils";
import {
  cancelOwnRequest,
  createLinkedExpenseReport,
  getRequestsProgress,
  listDepartmentExpenseReports,
} from "@/modules/accounting";
import { getShuttleDepartments } from "../auth";
import { EXPENSE_CATEGORY_LABEL } from "../schemas";
import type { ShuttleExpenseCategory } from "@/generated/prisma/enums";
import { entryTitle, fmtEuro, loadShuttleEntry, type ShuttleActor } from "./ledger";
import { fromIsoDate, isActiveReimbursement, reimbursementStatus, toIsoDate } from "./ledger-read";

/**
 * Liens du registre avec la comptabilité (spec 073) :
 *   - A : remboursement d'une avance personnelle, demandé depuis la ligne par son auteur ;
 *   - B : avances de budget versées, lues dans la comptabilité (voir `ledger-read`) ;
 *   - C : notes de frais de la Navette faites hors registre, ajoutées par la compta.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(churchId: string, actorId: string, entryId: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actorId, churchId, action: "UPDATE", entityType: "ShuttleEntry", entityId: entryId, details });
}

/** Département Navette de l'auteur (le premier s'il y en a plusieurs), à défaut le premier de l'église. */
async function authorShuttleDepartment(churchId: string, userId: string): Promise<string | null> {
  const departments = await getShuttleDepartments(churchId);
  if (departments.length === 0) return null;
  const deptIds = departments.map((d) => d.id);
  const prisma = await db();
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId, churchId } },
    select: { memberId: true },
  });
  if (link) {
    const membership = await prisma.memberDepartment.findFirst({
      where: { memberId: link.memberId, departmentId: { in: deptIds } },
      select: { departmentId: true },
    });
    if (membership) return membership.departmentId;
  }
  const lead = await prisma.userDepartment.findFirst({
    where: { departmentId: { in: deptIds }, userChurchRole: { userId, churchId } },
    select: { departmentId: true },
  });
  return lead?.departmentId ?? deptIds[0];
}

/** A — Demande le remboursement d'une avance personnelle : note de frais au nom de l'auteur. */
export async function requestReimbursement(entryId: string, actor: ShuttleActor) {
  const entry = await loadShuttleEntry(entryId);
  if (entry.deletedAt) throw new ApiError(404, "Ligne introuvable");
  if (entry.createdById !== actor.id) throw new ApiError(403, "Seul l'auteur de la dépense peut en demander le remboursement");
  if (entry.kind !== "EXPENSE" || !entry.personalAdvance) {
    throw new ApiError(400, "Seule une dépense payée en avance personnelle se rembourse");
  }
  if (entry.reimbursementRequestId) {
    const [req] = await getRequestsProgress([entry.reimbursementRequestId]);
    if (req && isActiveReimbursement(reimbursementStatus(req).status)) {
      throw new ApiError(409, "Un remboursement est déjà demandé pour cette dépense");
    }
  }

  const amount = -Number(entry.amount);
  const day = entry.date.toLocaleDateString("fr-FR", { timeZone: "UTC" });
  const request = await createLinkedExpenseReport({
    churchId: entry.churchId,
    departmentId: await authorShuttleDepartment(entry.churchId, actor.id),
    submittedById: actor.id,
    label: `Navette : ${entryTitle(entry)}${entry.vendor ? `, ${entry.vendor}` : ""}, ${day}`.slice(0, 200),
    description: [entry.label, "Avance personnelle déclarée dans le registre de la navette."].filter(Boolean).join("\n"),
    amount,
    receipt: entry.receiptKey
      ? { key: entry.receiptKey, filename: entry.receiptName ?? "justificatif", mimeType: entry.receiptMime ?? "application/octet-stream", size: entry.receiptSize ?? 0 }
      : null,
  });

  const prisma = await db();
  await prisma.shuttleEntry.update({ where: { id: entry.id }, data: { reimbursementRequestId: request.id } });
  await audit(entry.churchId, actor.id, entry.id, { reimbursement: "demandé", requestId: request.id, amount });
  return { requestId: request.id };
}

/** A — Annule la demande de remboursement tant qu'elle n'est pas traitée (auteur seulement). */
export async function cancelReimbursement(entryId: string, actor: ShuttleActor) {
  const entry = await loadShuttleEntry(entryId);
  if (entry.createdById !== actor.id) throw new ApiError(403, "Seul l'auteur de la dépense peut annuler sa demande");
  if (!entry.reimbursementRequestId) throw new ApiError(404, "Aucune demande de remboursement");
  const cancelled = await cancelOwnRequest(entry.reimbursementRequestId, actor.id);
  if (!cancelled) throw new ApiError(409, "La demande est déjà traitée par la comptabilité : elle ne s'annule plus.");
  await audit(entry.churchId, actor.id, entry.id, { reimbursement: "annulé", requestId: entry.reimbursementRequestId });
}

/** C — Ajoute au registre une note de frais de la Navette faite hors registre (compta). */
export async function importExpenseReport(
  churchId: string,
  requestId: string,
  category: ShuttleExpenseCategory,
  actor: ShuttleActor
) {
  if (!actor.manager) throw new ApiError(403, "Réservé à la comptabilité");
  const departments = await getShuttleDepartments(churchId);
  const reports = await listDepartmentExpenseReports(churchId, departments.map((d) => d.id));
  const report = reports.find((r) => r.id === requestId);
  if (!report) throw new ApiError(404, "Note de frais introuvable");

  const prisma = await db();
  const already = await prisma.shuttleEntry.findFirst({
    where: { churchId, deletedAt: null, OR: [{ sourceRequestId: requestId }, { reimbursementRequestId: requestId }] },
    select: { id: true },
  });
  if (already) throw new ApiError(409, "Cette note de frais est déjà dans le registre");

  // Justificatif repris par copie : chaque module supprime ses fichiers sans toucher à l'autre.
  let receipt = {};
  const attachment = report.attachments[0];
  if (attachment) {
    const { readStoredFile, storeFile } = await import("@/lib/file-storage");
    const bytes = await readStoredFile(attachment.s3Key);
    if (bytes) {
      const ext = attachment.filename.split(".").pop()?.toLowerCase() ?? "bin";
      const key = `shuttle/${churchId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      await storeFile(key, bytes, attachment.mimeType);
      receipt = { receiptKey: key, receiptName: attachment.filename, receiptMime: attachment.mimeType, receiptSize: attachment.size };
    }
  }

  // Une ligne précédemment supprimée peut encore porter le lien unique : on le libère.
  await prisma.shuttleEntry.updateMany({
    where: { churchId, sourceRequestId: requestId, deletedAt: { not: null } },
    data: { sourceRequestId: null },
  });
  const entry = await prisma.shuttleEntry.create({
    data: {
      churchId,
      kind: "EXPENSE",
      category,
      amount: -Number(report.amount),
      date: fromIsoDate(toIsoDate(report.createdAt)),
      label: `Note de frais de ${report.submittedBy.name ?? report.submittedBy.email ?? "—"} : ${report.label}`.slice(0, 200),
      personalAdvance: true,
      sourceRequestId: requestId,
      createdById: actor.id,
      updatedById: actor.id,
      ...receipt,
    },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actor.id,
    churchId,
    action: "CREATE",
    entityType: "ShuttleEntry",
    entityId: entry.id,
    details: {
      after: { kind: "EXPENSE", category: EXPENSE_CATEGORY_LABEL[category], amount: Number(entry.amount) },
      importedFrom: requestId,
      label: `Note de frais « ${report.label} » (${fmtEuro(Number(report.amount))}) ajoutée au registre`,
    },
  });
  return entry;
}
