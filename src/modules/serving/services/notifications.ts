import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notifications";
import { buildGenericNotificationEmail, sendEmail } from "@/lib/email";

/**
 * Notifications des candidatures (spec 073), domaine `serving`. Elles ne portent jamais de donnée
 * de la fiche au-delà du prénom et du nom (texte visible sur un écran verrouillé, spec 068) ni de
 * pièce jointe : un lien vers Koinonia suffit.
 */

const DOMAIN = "serving";
export const SERVING_ENTITY = "ServingApplication";

export function applicationLink(applicationId: string): string {
  return `/candidatures/${applicationId}`;
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

export async function notifyObservationEnding(
  churchId: string,
  departmentId: string,
  departmentName: string,
  who: Who,
  overdue: boolean
) {
  await notifyUsers(await departmentLeadIds(churchId, departmentId), {
    domain: DOMAIN,
    type: overdue ? "SERVING_OBSERVATION_OVERDUE" : "SERVING_OBSERVATION_ENDING",
    title: overdue ? "Période d'observation terminée" : "Fin de période d'observation proche",
    message: overdue
      ? `L'observation de ${fullName(who)} dans ${departmentName} est terminée : confirme-la ou renvoie-la au PVS.`
      : `L'observation de ${fullName(who)} dans ${departmentName} se termine bientôt.`,
    link: applicationLink(who.applicationId),
    entityType: SERVING_ENTITY,
    entityId: who.applicationId,
  });
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
