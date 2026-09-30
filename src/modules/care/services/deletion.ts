import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteItemNotifications } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Suppression définitive d'une demande de rendez-vous pastoral ou d'un suivi (spec 057,
 * ADR-0019) : dans une transaction, ce qui n'existe que par l'objet (entrée d'agenda,
 * historique, notifications), puis l'objet ; une fois validée, une seule ligne de journal
 * `DELETE` sans aucune donnée personnelle.
 */

interface DeleteParams {
  id: string;
  churchId: string;
  actorId: string;
}

export async function deleteAppointmentRequest({ id, churchId, actorId }: DeleteParams): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.appointmentRequest.findFirst({
      where: { id, churchId },
      select: { msdpFollowUp: { select: { id: true } } },
    });
    if (!item) throw new ApiError(404, "Demande introuvable");
    if (item.msdpFollowUp) {
      throw new ApiError(409, "Un suivi de nouveau converti est lié à cette demande : supprimez-le d'abord.");
    }

    await tx.agendaEntry.deleteMany({ where: { requestId: id } });
    await tx.auditLog.deleteMany({ where: { entityType: "AppointmentRequest", entityId: id } });
    await deleteItemNotifications(tx, "AppointmentRequest", id, [`/care/requests/${id}`]);
    const { count } = await tx.appointmentRequest.deleteMany({ where: { id, churchId } });
    if (count === 0) throw new ApiError(404, "Demande introuvable");
  });

  await logAudit({ userId: actorId, churchId, action: "DELETE", entityType: "AppointmentRequest", entityId: id });
}

export async function deleteMsdpFollowUp({ id, churchId, actorId }: DeleteParams): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { entityType: "MsdpFollowUp", entityId: id } });
    await deleteItemNotifications(tx, "MsdpFollowUp", id, [`/care/followups/${id}`]);
    const { count } = await tx.msdpFollowUp.deleteMany({ where: { id, churchId } });
    if (count === 0) throw new ApiError(404, "Suivi introuvable");
  });

  await logAudit({ userId: actorId, churchId, action: "DELETE", entityType: "MsdpFollowUp", entityId: id });
}

/**
 * Éléments `care` issus d'une demande d'intégration (rendez-vous « soin pastoral », suivi
 * « appel au salut ») — tant qu'il en existe, la demande ne peut pas être supprimée. Prend le
 * client de transaction pour que contrôle et suppression soient atomiques.
 */
export async function countCareItemsFromIntegrationRequest(
  tx: Prisma.TransactionClient,
  requestId: string
): Promise<number> {
  const [appointments, followUps] = await Promise.all([
    tx.appointmentRequest.count({ where: { sourceIntegrationRequestId: requestId } }),
    tx.msdpFollowUp.count({ where: { requestId } }),
  ]);
  return appointments + followUps;
}

/** Ce que la fiche d'un rendez-vous doit savoir pour proposer la suppression (spec 057). */
export async function getAppointmentDeletionInfo(
  id: string
): Promise<{ followUpId: string | null; hasAgendaEntry: boolean }> {
  const item = await prisma.appointmentRequest.findUnique({
    where: { id },
    select: { msdpFollowUp: { select: { id: true } }, agendaEntry: { select: { id: true } } },
  });
  return { followUpId: item?.msdpFollowUp?.id ?? null, hasAgendaEntry: !!item?.agendaEntry };
}

