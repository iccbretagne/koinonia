import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notifications";
import { buildGenericNotificationEmail, sendEmail } from "@/lib/email";
import { getPvsDepartmentIds } from "../auth";
import { paths } from "@/lib/paths";

/**
 * Notifications des candidatures (spec 077), domaine `serving`. Elles ne portent jamais de donnée
 * de la fiche au-delà du prénom et du nom (texte visible sur un écran verrouillé, spec 068) ni de
 * pièce jointe : un lien vers Koinonia suffit.
 */

const DOMAIN = "serving";
export const SERVING_ENTITY = "ServingApplication";

export function applicationLink(applicationId: string): string {
  return paths.candidatures.application(applicationId);
}

async function adminUserIds(churchId: string): Promise<string[]> {
  const rows = await prisma.userChurchRole.findMany({
    where: { churchId, role: "ADMIN" },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * Comptes de l'équipe PVS : responsables (principal ou adjoint) d'un département PVS, comptes liés
 * aux fiches STAR du PVS et Ministres du ministère du PVS. À défaut, les Admins de l'église.
 */
export async function pvsRecipientIds(churchId: string, pvsDeptIds: string[]): Promise<string[]> {
  if (pvsDeptIds.length > 0) {
    const [heads, members, ministries] = await Promise.all([
      prisma.userDepartment.findMany({
        where: { departmentId: { in: pvsDeptIds }, userChurchRole: { churchId } },
        select: { userChurchRole: { select: { userId: true } } },
      }),
      prisma.memberUserLink.findMany({
        where: {
          churchId,
          validatedAt: { not: null },
          member: { departments: { some: { departmentId: { in: pvsDeptIds } } } },
        },
        select: { userId: true },
      }),
      prisma.department.findMany({ where: { id: { in: pvsDeptIds } }, select: { ministryId: true } }),
    ]);
    const ministers = await prisma.userChurchRole.findMany({
      where: { churchId, role: "MINISTER", ministryId: { in: ministries.map((m) => m.ministryId) } },
      select: { userId: true },
    });
    const ids = new Set([
      ...heads.map((h) => h.userChurchRole.userId),
      ...members.map((m) => m.userId),
      ...ministers.map((m) => m.userId),
    ]);
    if (ids.size > 0) return [...ids];
  }
  return adminUserIds(churchId);
}

/** Responsables du département et Ministre de son ministère ; à défaut, les Admins. */
export async function departmentLeadIds(churchId: string, departmentId: string): Promise<string[]> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { ministryId: true } });
  if (!dept) return [];
  const [heads, ministers] = await Promise.all([
    prisma.userDepartment.findMany({
      where: { departmentId, userChurchRole: { churchId, role: "DEPARTMENT_HEAD" } },
      select: { userChurchRole: { select: { userId: true } } },
    }),
    prisma.userChurchRole.findMany({
      where: { churchId, role: "MINISTER", ministryId: dept.ministryId },
      select: { userId: true },
    }),
  ]);
  const ids = new Set([...heads.map((h) => h.userChurchRole.userId), ...ministers.map((m) => m.userId)]);
  return ids.size > 0 ? [...ids] : adminUserIds(churchId);
}

/**
 * Copie institutionnelle à la boîte du PVS (`Department.contactEmail`) : adresse d'équipe, sans
 * compte ni préférence — même statut que l'email de comptabilité de l'église. Lien seul.
 */
async function copyToPvsMailboxes(pvsDeptIds: string[], content: { title: string; message: string; link: string }) {
  if (pvsDeptIds.length === 0) return;
  const depts = await prisma.department.findMany({
    where: { id: { in: pvsDeptIds }, contactEmail: { not: null } },
    select: { contactEmail: true },
  });
  const to = [...new Set(depts.map((d) => d.contactEmail!).filter(Boolean))];
  if (to.length === 0) return;
  try {
    await sendEmail({ to, ...buildGenericNotificationEmail(content) });
  } catch (err) {
    logger.error({ err }, "Copie de notification à l'adresse du PVS échouée");
  }
}

type Who = { applicationId: string; firstName: string; lastName: string };

function fullName(who: Who) {
  return `${who.firstName} ${who.lastName}`;
}

export async function notifyNewApplication(churchId: string, pvsDeptIds: string[], who: Who) {
  const content = {
    title: "Nouvelle candidature au service",
    message: `${fullName(who)} a envoyé sa fiche de candidature.`,
    link: applicationLink(who.applicationId),
  };
  await notifyUsers(await pvsRecipientIds(churchId, pvsDeptIds), {
    domain: DOMAIN,
    type: "SERVING_NEW",
    ...content,
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
  await copyToPvsMailboxes(pvsDeptIds, content);
}

export async function notifyAssigned(churchId: string, departmentId: string, departmentName: string, who: Who) {
  await notifyUsers(await departmentLeadIds(churchId, departmentId), {
    domain: DOMAIN,
    type: "SERVING_ASSIGNED",
    title: `Nouvelle personne orientée vers ${departmentName}`,
    message: `Le PVS a orienté ${fullName(who)} vers ${departmentName}. Accueille-la ou renvoie-la au PVS.`,
    link: applicationLink(who.applicationId),
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
}

export async function notifySentBack(churchId: string, pvsDeptIds: string[], departmentName: string, who: Who) {
  const content = {
    title: "Candidature renvoyée au PVS",
    message: `${departmentName} a renvoyé ${fullName(who)} au PVS.`,
    link: applicationLink(who.applicationId),
  };
  await notifyUsers(await pvsRecipientIds(churchId, pvsDeptIds), {
    domain: DOMAIN,
    type: "SERVING_SENT_BACK",
    ...content,
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
  await copyToPvsMailboxes(pvsDeptIds, content);
}

export async function notifyConfirmed(churchId: string, pvsDeptIds: string[], departmentName: string, who: Who) {
  await notifyUsers(await pvsRecipientIds(churchId, pvsDeptIds), {
    domain: DOMAIN,
    type: "SERVING_CONFIRMED",
    title: "STAR confirmé",
    message: `${fullName(who)} est confirmé(e) dans ${departmentName}.`,
    link: applicationLink(who.applicationId),
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
}

/**
 * Fin d'observation proche, puis échue : le département décide (confirme ou renvoie) ; le PVS
 * (équipe et boîte du PVS) est prévenu en même temps pour pouvoir relancer.
 */
export async function notifyObservationEnding(
  churchId: string,
  departmentId: string,
  departmentName: string,
  who: Who,
  overdue: boolean,
  pvsDeptIds: string[] = []
) {
  const type = overdue ? "SERVING_OBSERVATION_OVERDUE" : "SERVING_OBSERVATION_ENDING";
  const title = overdue ? "Période d'observation terminée" : "Fin de période d'observation proche";
  const link = applicationLink(who.applicationId);
  const leads = await departmentLeadIds(churchId, departmentId);
  await notifyUsers(leads, {
    domain: DOMAIN,
    type,
    title,
    message: overdue
      ? `L'observation de ${fullName(who)} dans ${departmentName} est terminée : confirme-la ou renvoie-la au PVS.`
      : `L'observation de ${fullName(who)} dans ${departmentName} se termine bientôt.`,
    link,
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
  if (pvsDeptIds.length === 0) return;
  const pvsContent = {
    title,
    message: overdue
      ? `L'observation de ${fullName(who)} dans ${departmentName} est terminée, sans décision du département.`
      : `L'observation de ${fullName(who)} dans ${departmentName} se termine bientôt.`,
    link,
  };
  const leadSet = new Set(leads);
  const pvsIds = (await pvsRecipientIds(churchId, pvsDeptIds)).filter((id) => !leadSet.has(id));
  await notifyUsers(pvsIds, { domain: DOMAIN, type, ...pvsContent, entityType: SERVING_ENTITY, entityId: who.applicationId });
  await copyToPvsMailboxes(pvsDeptIds, pvsContent);
}

export async function notifyPurgeWarning(churchId: string, pvsDeptIds: string[], who: Who) {
  await notifyUsers(await pvsRecipientIds(churchId, pvsDeptIds), {
    domain: DOMAIN,
    type: "SERVING_PURGE_WARNING",
    title: "Candidature bientôt effacée",
    message: `La candidature de ${fullName(who)} n'a pas été traitée : elle sera effacée dans un mois.`,
    link: applicationLink(who.applicationId),
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
}

// ─── Entretiens (spec 082) ──────────────────────────────────────────────────

export type InterviewInfo = {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  location: string | null;
  visioUrl: string | null;
  interviewerId: string | null;
};

export type CandidateInfo = Who & {
  churchId: string;
  email: string | null;
  /** Lien de rendez-vous re-dérivé (null : aucun jeton posé). */
  token: string | null;
};

const when = (d: Date) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const interviewLink = (token: string) => `/entretien/${token}`;

async function interviewerName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, name: true } });
  return user?.displayName ?? user?.name ?? null;
}

function place(i: InterviewInfo): string {
  if (i.visioUrl) return `en visio (${i.visioUrl})`;
  return i.location ? `lieu : ${i.location}` : "lieu communiqué par l'équipe";
}

/**
 * Email au candidat (sans compte : liste blanche `sendEmail`, spec 053). Contenu : son propre
 * rendez-vous et son lien. Sans adresse sur la fiche, rien n'est envoyé.
 */
async function emailCandidate(candidate: CandidateInfo, title: string, message: string) {
  if (!candidate.email) return;
  try {
    await sendEmail({
      to: candidate.email,
      ...buildGenericNotificationEmail({ title, message, link: candidate.token ? interviewLink(candidate.token) : undefined }),
    });
  } catch (err) {
    logger.error({ err, applicationId: candidate.applicationId }, "Email d'entretien au candidat non envoyé");
  }
}

async function notifyInterviewer(userId: string | null, type: string, title: string, message: string, who: Who) {
  if (!userId) return;
  await notifyUsers([userId], { domain: DOMAIN, type, title, message, link: applicationLink(who.applicationId), entityType: SERVING_ENTITY, entityId: who.applicationId });
}

async function notifyPvs(churchId: string, type: string, title: string, message: string, who: Who, exclude: (string | null)[] = []) {
  const ids = (await pvsRecipientIds(churchId, await getPvsDepartmentIds(churchId))).filter((id) => !exclude.includes(id));
  await notifyUsers(ids, { domain: DOMAIN, type, title, message, link: applicationLink(who.applicationId), entityType: SERVING_ENTITY, entityId: who.applicationId });
}

/** Rendez-vous réservé (par le candidat ou par le PVS). */
export async function notifyInterviewBooked(candidate: CandidateInfo, interview: InterviewInfo, byCandidate: boolean, previous?: InterviewInfo | null) {
  const name = await interviewerName(interview.interviewerId);
  await emailCandidate(
    candidate,
    previous ? "Votre rendez-vous d'entretien est modifié" : "Votre rendez-vous d'entretien est confirmé",
    `Rendez-vous le ${when(interview.startsAt)} (${interview.durationMinutes} min), ${place(interview)}${name ? `, avec ${name}` : ""}. Vous pouvez le retrouver, le changer ou l'annuler jusqu'à 24 heures avant depuis le lien ci-dessous.`
  );
  await notifyInterviewer(interview.interviewerId, "SERVING_INTERVIEW_BOOKED", "Entretien réservé", `Entretien avec ${fullName(candidate)} le ${when(interview.startsAt)}.`, candidate);
  if (previous?.interviewerId && previous.interviewerId !== interview.interviewerId) {
    await notifyInterviewer(previous.interviewerId, "SERVING_INTERVIEW_CANCELLED", "Entretien déplacé", `L'entretien avec ${fullName(candidate)} du ${when(previous.startsAt)} a été déplacé.`, candidate);
  }
  if (byCandidate) {
    await notifyPvs(
      candidate.churchId,
      "SERVING_INTERVIEW_BOOKED",
      previous ? "Rendez-vous d'entretien changé" : "Rendez-vous d'entretien choisi",
      `${fullName(candidate)} a choisi un entretien le ${when(interview.startsAt)}.`,
      candidate,
      [interview.interviewerId]
    );
  }
}

/** Rendez-vous annulé. `REJECTED` : message neutre ; effacement : jamais de message au candidat. */
export async function notifyInterviewCancelled(
  candidate: CandidateInfo,
  interview: InterviewInfo,
  reason: "CANDIDATE" | "PVS" | "SLOT_REMOVED" | "REJECTED" | "PURGED"
) {
  if (reason === "REJECTED") {
    await emailCandidate(candidate, "Votre rendez-vous d'entretien est annulé", "Votre rendez-vous est annulé ; l'équipe vous recontactera.");
  } else if (reason === "PVS" || reason === "SLOT_REMOVED") {
    await emailCandidate(
      candidate,
      "Votre rendez-vous d'entretien est annulé",
      `Votre rendez-vous du ${when(interview.startsAt)} ne peut pas être maintenu. Choisissez un autre créneau depuis le lien ci-dessous.`
    );
  } else if (reason === "CANDIDATE") {
    await emailCandidate(candidate, "Votre rendez-vous d'entretien est annulé", `Votre rendez-vous du ${when(interview.startsAt)} est annulé. Vous pouvez en choisir un autre depuis le lien ci-dessous.`);
  }
  await notifyInterviewer(interview.interviewerId, "SERVING_INTERVIEW_CANCELLED", "Entretien annulé", `L'entretien avec ${fullName(candidate)} du ${when(interview.startsAt)} est annulé.`, candidate);
  if (reason === "CANDIDATE") {
    await notifyPvs(candidate.churchId, "SERVING_INTERVIEW_CANCELLED", "Rendez-vous d'entretien annulé", `${fullName(candidate)} a annulé son entretien.`, candidate, [interview.interviewerId]);
  }
}

/** Créneau réservé modifié par le PVS (horaire, lieu ou personne qui reçoit). */
export async function notifyInterviewMoved(candidate: CandidateInfo, before: InterviewInfo, after: InterviewInfo) {
  const name = await interviewerName(after.interviewerId);
  await emailCandidate(
    candidate,
    "Votre rendez-vous d'entretien est modifié",
    `Nouveau rendez-vous le ${when(after.startsAt)} (${after.durationMinutes} min), ${place(after)}${name ? `, avec ${name}` : ""}. Vous pouvez le changer ou l'annuler jusqu'à 24 heures avant depuis le lien ci-dessous.`
  );
  await notifyInterviewer(after.interviewerId, "SERVING_INTERVIEW_MOVED", "Entretien modifié", `Entretien avec ${fullName(candidate)} le ${when(after.startsAt)}.`, candidate);
  if (before.interviewerId && before.interviewerId !== after.interviewerId) {
    await notifyInterviewer(before.interviewerId, "SERVING_INTERVIEW_CANCELLED", "Entretien réattribué", `L'entretien avec ${fullName(candidate)} est confié à une autre personne.`, candidate);
  }
}

/** Rappel de la veille : email au candidat, notification à la personne qui reçoit. */
export async function notifyInterviewReminder(candidate: CandidateInfo, interview: InterviewInfo) {
  const name = await interviewerName(interview.interviewerId);
  await emailCandidate(
    candidate,
    "Rappel : votre entretien demain",
    `Rendez-vous le ${when(interview.startsAt)} (${interview.durationMinutes} min), ${place(interview)}${name ? `, avec ${name}` : ""}.`
  );
  await notifyInterviewer(interview.interviewerId, "SERVING_INTERVIEW_REMINDER", "Entretien demain", `Entretien avec ${fullName(candidate)} le ${when(interview.startsAt)}.`, candidate);
}

/** Issue à noter le lendemain : à la personne qui a reçu, à défaut l'équipe PVS. */
export async function notifyInterviewToComplete(candidate: CandidateInfo, interview: InterviewInfo) {
  const title = "Issue d'entretien à noter";
  const message = `Notez si l'entretien avec ${fullName(candidate)} a eu lieu.`;
  if (interview.interviewerId) await notifyInterviewer(interview.interviewerId, "SERVING_INTERVIEW_TO_COMPLETE", title, message, candidate);
  else await notifyPvs(candidate.churchId, "SERVING_INTERVIEW_TO_COMPLETE", title, message, candidate);
}

/** Relance d'une candidature « À planifier » : équipe PVS, prénom, nom et raison. */
export async function notifySchedulingReminder(candidate: CandidateInfo, reasonLabel: string) {
  await notifyPvs(candidate.churchId, "SERVING_SCHEDULING_REMINDER", "Candidature à planifier", `${fullName(candidate)} attend un entretien (${reasonLabel}).`, candidate);
}

/** Invitation à choisir un créneau (nouveaux créneaux ou invitation du PVS). */
export async function emailSlotsInvitation(candidate: CandidateInfo) {
  await emailCandidate(candidate, "Choisissez votre créneau d'entretien", "Des créneaux d'entretien sont disponibles : choisissez celui qui vous convient depuis le lien ci-dessous.");
}

/** « Retrouver mon rendez-vous » : le lien renvoyé à l'adresse de la fiche. */
export async function emailInterviewLink(candidate: CandidateInfo) {
  await emailCandidate(candidate, "Votre rendez-vous d'entretien", "Voici le lien pour retrouver, choisir, changer ou annuler votre rendez-vous d'entretien.");
}
