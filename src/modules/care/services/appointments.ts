import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { notifyUsersWithRole } from "@/lib/notifications";
import { sendEmail, buildAppointmentConfirmationEmail } from "@/lib/email";
import type { Prisma, AppointmentRequestStatus } from "@/generated/prisma/client";
import { resolveAssignee, type ResolvedAssignee } from "./assignee";
import {
  computeAppointmentTransitionData,
  type AppointmentActor,
  type AppointmentPatchBody,
} from "./appointment-state";
import { recordCareHistory } from "./history";
import {
  notifyAssigneeAssigned,
  notifyAssigneeUnassigned,
  notifyReferentsHandback,
  notifyProtocoleToSchedule,
  notifyRequesterScheduled,
  notifyRequesterRejected,
} from "./notifications";
import { createFollowUpFromAppointmentOrientation } from "./followups";

/**
 * Demandes de rendez-vous pastoral (spec 052). Le dépôt (lot 1) reste à comportement
 * constant : commun au formulaire public et au formulaire connecté, sans jour préféré. Les
 * transitions (lot 2) passent par la machine à états pure `appointment-state.ts` — affectation
 * au choix profil pastoral/membre du MSDP, issue, retour au référent, motifs de rejet qualifiés.
 */

export const appointmentSubmitSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
  subject: z.string().min(1, "L'objet est requis"),
  message: z.string().min(1, "Le message est requis"),
});

export type AppointmentSubmitInput = z.infer<typeof appointmentSubmitSchema>;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, displayName: true } },
  assignedTo: { select: { id: true, name: true, role: true, userId: true } },
  assignedMember: { select: { id: true, name: true, email: true } },
  qualifiedBy: { select: { id: true, name: true, displayName: true } },
} satisfies Prisma.AppointmentRequestInclude;

/** Dépôt commun au formulaire public et au formulaire connecté (T35 : même demande reçue). */
export async function submitAppointmentRequest(
  data: AppointmentSubmitInput,
  userId: string | null
) {
  const [request, church] = await Promise.all([
    prisma.appointmentRequest.create({
      data: {
        churchId: data.churchId,
        userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        subject: data.subject,
        message: data.message,
      },
    }),
    prisma.church.findUnique({ where: { id: data.churchId }, select: { name: true } }),
  ]);

  notifyUsersWithRole(data.churchId, "PASTORAL_CARE_REFERENT", {
    type: "CARE_APPOINTMENT_PENDING",
    title: "Nouvelle demande de RDV",
    message: `${data.firstName} ${data.lastName} a soumis une demande : « ${data.subject} ».`,
    link: "/care",
  }).catch(() => {});

  if (data.email && church) {
    const { subject: emailSubject, html } = buildAppointmentConfirmationEmail({
      firstName: data.firstName,
      lastName: data.lastName,
      subject: data.subject,
      churchName: church.name,
    });
    sendEmail({ to: data.email, subject: emailSubject, html }).catch((err) => {
      console.error("[care/appointments] sendEmail confirmation failed:", err?.message ?? err);
    });
  }

  return request;
}

export async function listAppointmentRequests(
  churchId: string,
  statuses: AppointmentRequestStatus[]
) {
  return prisma.appointmentRequest.findMany({
    where: { churchId, status: { in: statuses } },
    include: LIST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getAppointmentRequestById(id: string) {
  return prisma.appointmentRequest.findUnique({ where: { id }, include: LIST_INCLUDE });
}

/**
 * Résumé du rendez-vous pastoral né d'une demande d'accueil (T26, fiche d'accueil) — jamais le
 * `status` seul ne révèle `subject`/`message`, pas besoin de projection ici.
 */
export async function getAppointmentSummaryBySourceRequestId(sourceIntegrationRequestId: string) {
  return prisma.appointmentRequest.findUnique({
    where: { sourceIntegrationRequestId },
    select: { id: true, status: true },
  });
}

/** Demandes du demandeur connecté, sans l'accompagnant (T45, « Mes demandes »). */
export async function listMyRequests(userId: string, churchId: string) {
  return prisma.appointmentRequest.findMany({
    where: { churchId, userId },
    select: {
      id: true,
      subject: true,
      status: true,
      createdAt: true,
      scheduledFor: true,
      rejectReasonCode: true,
      rejectReason: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Applique une transition (validate/reject/reassign/set_date/outcome/handback), calcule les
 * notifications et journalise l'historique (T39, T42, T43). Le suivi de nouveau converti né
 * d'une orientation (T41) est créé ici : c'est le seul endroit qui a déjà l'identité et le
 * dossier de parcours de la demande sous la main.
 */
export async function applyAppointmentTransition(params: {
  id: string;
  churchId: string;
  body: AppointmentPatchBody;
  actorId: string;
  isReferent: boolean;
}) {
  const { id, churchId, body, actorId, isReferent } = params;

  const existing = await prisma.appointmentRequest.findFirst({
    where: { id, churchId },
    include: LIST_INCLUDE,
  });
  if (!existing) throw new ApiError(404, "Demande introuvable");

  const currentAssigneeUserId = existing.assignedMemberId ?? existing.assignedTo?.userId ?? null;
  const isCurrentAssignee = !!currentAssigneeUserId && currentAssigneeUserId === actorId;
  const currentAssigneeHasAccount = existing.assignedMemberId
    ? true
    : existing.assignedToId
      ? !!existing.assignedTo?.userId
      : true;

  const actor: AppointmentActor = { isReferent, isCurrentAssignee, currentAssigneeHasAccount };

  let assignee: ResolvedAssignee | null = null;
  if (body.action === "validate" || body.action === "reassign") {
    assignee = await resolveAssignee(churchId, body.assignee);
  }

  const now = new Date();
  const result = computeAppointmentTransitionData(
    {
      status: existing.status,
      assignedToId: existing.assignedToId,
      assignedMemberId: existing.assignedMemberId,
      scheduledFor: existing.scheduledFor,
    },
    body,
    actor,
    now,
    actorId,
    assignee
  );

  const updated = await prisma.appointmentRequest.update({
    where: { id },
    data: { ...result.data, updatedById: actorId },
    include: LIST_INCLUDE,
  });

  const personName = `${existing.firstName} ${existing.lastName}`;

  await recordCareHistory({
    userId: actorId,
    churchId,
    kind: "requests",
    itemId: id,
    action: body.action,
    from: existing.status,
    to: typeof result.data.status === "string" ? result.data.status : existing.status,
    assignee: assignee?.name ?? null,
    note: body.action === "handback" ? body.reason : body.action === "validate" ? body.note ?? null : null,
  });

  if (result.notifyAssigned) {
    await notifyAssigneeAssigned({ assignee: result.notifyAssigned, kind: "requests", itemId: id, personName });
  }
  if (result.notifyPreviousAssignee && currentAssigneeUserId) {
    await notifyAssigneeUnassigned({ userId: currentAssigneeUserId, kind: "requests", personName });
  }
  if (result.notifyReferents) {
    await notifyReferentsHandback({
      churchId,
      kind: "requests",
      itemId: id,
      personName,
      reason: body.action === "handback" ? body.reason : "",
    });
  }
  if (result.notifyProtocole) {
    await notifyProtocoleToSchedule({ churchId, personName });
  }
  if (body.action === "set_date") {
    await notifyRequesterScheduled({
      userId: existing.userId,
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      subject: existing.subject,
      churchId,
      scheduledFor: new Date(body.scheduledFor),
    });
  }
  if (body.action === "reject") {
    await notifyRequesterRejected({
      userId: existing.userId,
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      subject: existing.subject,
      churchId,
      reasonCode: body.reasonCode,
      comment: body.comment ?? null,
    });
  }
  if (result.createFollowUpFromOrientation) {
    await createFollowUpFromAppointmentOrientation({
      appointmentId: id,
      churchId,
      firstName: existing.firstName,
      lastName: existing.lastName,
      phone: existing.phone,
      email: existing.email,
      personJourneyId: existing.personJourneyId,
    });
  }

  return updated;
}

/**
 * VALIDATED → SCHEDULED, appelé par l'orchestrateur `agenda` (T19) dans la transaction qui
 * crée l'entrée d'agenda — réservé à une demande confiée à un **profil pastoral** : un membre
 * du MSDP fixe sa propre date via l'action `set_date` (lot 2), sans entrée d'agenda.
 * `scheduledFor` (spec 052) est renseigné en plus de `scheduledAt` (horodatage de l'action).
 */
export async function markAppointmentScheduled(
  tx: Prisma.TransactionClient,
  params: { id: string; scheduledById: string; scheduledFor: Date }
) {
  const { id, scheduledById, scheduledFor } = params;

  const existing = await tx.appointmentRequest.findUnique({
    where: { id },
    select: { status: true, assignedToId: true },
  });
  if (!existing) throw new ApiError(404, "Demande introuvable");
  if (existing.status !== "VALIDATED")
    throw new ApiError(400, "Seules les demandes VALIDÉES peuvent être planifiées");
  if (!existing.assignedToId)
    throw new ApiError(400, "La demande n'est pas assignée à un profil pastoral");

  return tx.appointmentRequest.update({
    where: { id },
    data: {
      status: "SCHEDULED",
      scheduledById,
      scheduledAt: new Date(),
      scheduledFor,
      updatedById: scheduledById,
    },
  });
}

/** SCHEDULED → VALIDATED, appelé quand l'entrée d'agenda liée est supprimée (T19). */
export async function revertAppointmentToValidated(tx: Prisma.TransactionClient, id: string) {
  await tx.appointmentRequest.update({
    where: { id },
    data: { status: "VALIDATED", scheduledById: null, scheduledAt: null, scheduledFor: null },
  });
}

/** Répercute un changement de date d'entrée d'agenda sur `scheduledFor` (T19). */
export async function updateAppointmentScheduledFor(
  tx: Prisma.TransactionClient,
  id: string,
  scheduledFor: Date
) {
  await tx.appointmentRequest.update({ where: { id }, data: { scheduledFor } });
}
