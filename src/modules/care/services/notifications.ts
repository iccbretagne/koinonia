import { prisma } from "@/lib/prisma";
import { createNotification, notifyDeptMembers } from "@/lib/notifications";
import { sendEmail, buildAppointmentScheduledEmail, buildAppointmentRejectedEmail } from "@/lib/email";
import { DEPT_FN } from "@/lib/department-functions";
import type { ResolvedAssignee } from "./assignee";
import { REJECT_REASON_LABELS, type REJECT_REASON_CODES } from "./appointment-state";

type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

/**
 * Notifications du nouveau flux (spec 052, lot 2) — affectation, dessaisissement, retour au
 * référent, date fixée par un membre du MSDP, rejet avec motif. Les emails aux accompagnants
 * ne contiennent jamais `message` ni `subject` : seulement l'identité et un lien.
 */

export type CareItemKind = "requests" | "followups";

function itemLink(kind: CareItemKind, id: string): string {
  return `/care/${kind}/${id}`;
}

/** « la demande de rendez-vous pastoral de » / « le suivi de », suivi du nom de la personne. */
function itemLabel(kind: CareItemKind): string {
  return kind === "requests" ? "la demande de rendez-vous pastoral de" : "le suivi de";
}

/**
 * Affectation à un accompagnant : notification in-app s'il a un compte, et email s'il a une
 * adresse (spec 052 — les deux canaux ; l'absence d'email ne bloque pas l'affectation).
 */
export async function notifyAssigneeAssigned(params: {
  assignee: ResolvedAssignee;
  kind: CareItemKind;
  itemId: string;
  personName: string;
}): Promise<void> {
  const { assignee, kind, itemId, personName } = params;
  const link = itemLink(kind, itemId);
  const label = kind === "requests" ? "rendez-vous pastoral" : "suivi de nouveau converti";

  if (assignee.userId) {
    await createNotification({
      userId: assignee.userId,
      type: "CARE_ASSIGNED",
      title: "Nouvel accompagnement confié",
      message: `On vous a confié ${itemLabel(kind)} ${personName}.`,
      link,
    }).catch(() => {});
  }

  if (assignee.email) {
    const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
    await sendEmail({
      to: assignee.email,
      subject: `Un ${label} vous a été confié`,
      html: `<p>Bonjour ${assignee.name ?? ""},</p><p>Un ${label} concernant <strong>${personName}</strong> vous a été confié.</p><p><a href="${appUrl}${link}">Voir →</a></p>`,
    }).catch(() => {});
  }
}

/** Dessaisissement : notifie l'ancien accompagnant s'il a un compte (email seul non prévu ici — le dessaisissement n'appelle pas à agir). */
export async function notifyAssigneeUnassigned(params: {
  userId: string | null;
  kind: CareItemKind;
  personName: string;
}): Promise<void> {
  if (!params.userId) return;
  await createNotification({
    userId: params.userId,
    type: "CARE_UNASSIGNED",
    title: "Accompagnement réaffecté",
    message: `Vous n'êtes plus en charge de ${itemLabel(params.kind)} ${params.personName}.`,
    link: "/care",
  }).catch(() => {});
}

/** Retour au référent (handback) : tous les détenteurs de `care:qualify` de l'église. */
export async function notifyReferentsHandback(params: {
  churchId: string;
  kind: CareItemKind;
  itemId: string;
  personName: string;
  reason: string;
}): Promise<void> {
  const { churchId, kind, itemId, personName, reason } = params;
  const referents = await prisma.userChurchRole.findMany({
    where: {
      churchId,
      OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN", "PASTORAL_CARE_REFERENT"] } }],
    },
    select: { userId: true },
  });
  const userIds = Array.from(new Set(referents.map((r) => r.userId)));
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "CARE_HANDBACK",
      title: "Demande rendue pour réaffectation",
      message: `${personName} — motif : ${reason}`,
      link: itemLink(kind, itemId),
    })),
    skipDuplicates: true,
  });
}

/** Confié à un profil pastoral (validate/reassign) : le Protocole doit le planifier. */
export async function notifyProtocoleToSchedule(params: {
  churchId: string;
  personName: string;
}): Promise<void> {
  await notifyDeptMembers(params.churchId, DEPT_FN.PROTOCOLE, {
    type: "CARE_APPOINTMENT_VALIDATED",
    title: "Demande RDV à planifier",
    message: `La demande de ${params.personName} est prête à être planifiée.`,
    link: "/agenda/schedule",
  }).catch(() => {});
}

/** Date fixée par un membre du MSDP (set_date) : le demandeur est prévenu, comme pour une planification par le protocole. */
export async function notifyRequesterScheduled(params: {
  userId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  subject: string;
  churchId: string;
  scheduledFor: Date;
}): Promise<void> {
  const { userId, email, firstName, lastName, subject, churchId, scheduledFor } = params;
  if (userId) {
    const dateStr = scheduledFor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = scheduledFor.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    await createNotification({
      userId,
      type: "CARE_APPOINTMENT_SCHEDULED",
      title: "Rendez-vous pastoral confirmé",
      message: `Votre demande « ${subject} » a été planifiée le ${dateStr} à ${timeStr}.`,
      link: "/requests",
    }).catch(() => {});
  }
  if (email) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
    if (church) {
      const { subject: emailSubject, html } = buildAppointmentScheduledEmail({
        firstName,
        lastName,
        subject,
        churchName: church.name,
        startsAt: scheduledFor,
        location: null,
      });
      sendEmail({ to: email, subject: emailSubject, html }).catch(() => {});
    }
  }
}

/** Rejet, avec le motif qualifié en clair (T42). */
export async function notifyRequesterRejected(params: {
  userId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  subject: string;
  churchId: string;
  reasonCode: RejectReasonCode;
  comment: string | null;
}): Promise<void> {
  const { userId, email, firstName, lastName, subject, churchId, reasonCode, comment } = params;
  const reasonLabel = REJECT_REASON_LABELS[reasonCode];
  const fullReason = comment ? `${reasonLabel} — ${comment}` : reasonLabel;

  if (userId) {
    await createNotification({
      userId,
      type: "CARE_APPOINTMENT_REJECTED",
      title: "Demande de RDV non retenue",
      message: `Votre demande de rendez-vous pastoral n'a pas pu être retenue. Motif : ${fullReason}`,
      link: "/requests",
    }).catch(() => {});
  }
  if (email) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
    if (church) {
      const { subject: emailSubject, html } = buildAppointmentRejectedEmail({
        firstName,
        lastName,
        subject,
        churchName: church.name,
        rejectReason: fullReason,
      });
      sendEmail({ to: email, subject: emailSubject, html }).catch(() => {});
    }
  }
}
