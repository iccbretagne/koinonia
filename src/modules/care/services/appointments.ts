import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { notifyUsersWithRole, notifyDeptMembers, createNotification } from "@/lib/notifications";
import { sendEmail, buildAppointmentConfirmationEmail, buildAppointmentRejectedEmail } from "@/lib/email";
import { DEPT_FN } from "@/lib/department-functions";
import type { Prisma, AppointmentRequestStatus } from "@/generated/prisma/client";

/**
 * Reprise à l'identique des demandes de rendez-vous pastoral (ex-`agenda`, spec 052/lot 1) :
 * mêmes transitions, mêmes notifications, simplement propriété de `care` et sans le jour
 * préféré (retiré du dépôt, spec 052 — la colonne `preferredDays` reste en base sans être
 * lue ni écrite). L'affectation à un membre du MSDP et les autres nouveautés (issue, retour
 * au référent, motifs de rejet qualifiés) arrivent au lot 2.
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

export const appointmentPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("validate"),
    assignedToId: z.string().min(1, "Le profil pastoral est requis"),
    qualificationNote: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    rejectReason: z.string().nullable().optional(),
  }),
]);

export type AppointmentPatchBody = z.infer<typeof appointmentPatchSchema>;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, displayName: true } },
  assignedTo: { select: { id: true, name: true, role: true, userId: true } },
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

/** PENDING → VALIDATED : confiée à un profil pastoral (comportement actuel, spec 052 lot 1). */
export async function validateAppointmentRequest(params: {
  id: string;
  churchId: string;
  assignedToId: string;
  qualificationNote: string | null;
  actorId: string;
}) {
  const { id, churchId, assignedToId, qualificationNote, actorId } = params;

  const existing = await prisma.appointmentRequest.findUnique({
    where: { id },
    select: { status: true, firstName: true, lastName: true, subject: true },
  });
  if (!existing) throw new ApiError(404, "Demande introuvable");
  if (existing.status !== "PENDING")
    throw new ApiError(400, "Seules les demandes EN ATTENTE peuvent être qualifiées");

  const profile = await prisma.pastoralProfile.findFirst({
    where: { id: assignedToId, churchId },
    select: { id: true },
  });
  if (!profile) throw new ApiError(400, "Profil pastoral invalide ou hors périmètre");

  const updated = await prisma.appointmentRequest.update({
    where: { id },
    data: {
      status: "VALIDATED",
      assignedToId,
      assignedAt: new Date(),
      assignedById: actorId,
      qualifiedById: actorId,
      qualifiedAt: new Date(),
      qualificationNote: qualificationNote ?? null,
      updatedById: actorId,
    },
    include: LIST_INCLUDE,
  });

  notifyDeptMembers(churchId, DEPT_FN.PROTOCOLE, {
    type: "CARE_APPOINTMENT_VALIDATED",
    title: "Demande RDV à planifier",
    message: `La demande de ${existing.firstName} ${existing.lastName} est prête à être planifiée.`,
    link: "/agenda/schedule",
  }).catch(() => {});

  return updated;
}

/** PENDING → REJECTED. */
export async function rejectAppointmentRequest(params: {
  id: string;
  churchId: string;
  rejectReason: string | null;
  actorId: string;
}) {
  const { id, churchId, rejectReason, actorId } = params;

  const existing = await prisma.appointmentRequest.findUnique({
    where: { id },
    select: {
      status: true,
      userId: true,
      email: true,
      firstName: true,
      lastName: true,
      subject: true,
    },
  });
  if (!existing) throw new ApiError(404, "Demande introuvable");
  if (existing.status !== "PENDING")
    throw new ApiError(400, "Seules les demandes EN ATTENTE peuvent être qualifiées");

  const updated = await prisma.appointmentRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      qualifiedById: actorId,
      qualifiedAt: new Date(),
      rejectReason: rejectReason ?? null,
      updatedById: actorId,
    },
  });

  if (existing.userId) {
    createNotification({
      userId: existing.userId,
      type: "CARE_APPOINTMENT_REJECTED",
      title: "Demande de RDV non retenue",
      message: `Votre demande de rendez-vous pastoral n'a pas pu être retenue.${rejectReason ? ` Motif : ${rejectReason}` : ""}`,
      link: "/requests",
    }).catch(() => {});
  }
  if (existing.email) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
    if (church) {
      const { subject: emailSubject, html } = buildAppointmentRejectedEmail({
        firstName: existing.firstName,
        lastName: existing.lastName,
        subject: existing.subject,
        churchName: church.name,
        rejectReason: rejectReason ?? null,
      });
      sendEmail({ to: existing.email, subject: emailSubject, html }).catch((err) => {
        console.error("[care/appointments] sendEmail rejected failed:", err?.message ?? err);
      });
    }
  }

  return updated;
}

/**
 * VALIDATED → SCHEDULED, appelé par l'orchestrateur `agenda` (T19) dans la transaction qui
 * crée l'entrée d'agenda. `scheduledFor` (spec 052) est renseigné en plus de `scheduledAt`
 * (horodatage de l'action) pour porter la date du rendez-vous indépendamment de l'accompagnant.
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
