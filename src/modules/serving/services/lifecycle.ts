import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { deleteItemNotifications } from "@/lib/notifications";
import { getPvsDepartmentIds } from "../auth";
import { getServingDurations } from "./settings";
import { deletePhoto } from "./photo";
import { applicationLink, notifyObservationEnding, notifyPurgeWarning, SERVING_ENTITY } from "./notifications";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  addMonths,
  ENDING_SOON_DAYS,
  OVERDUE_RELANCE_DAYS,
  PURGE_WARNING_MONTHS,
  retentionDeadline,
} from "./state";

/**
 * Cycle de vie des candidatures (spec 073), tâche cron horaire `serving`. Idempotente : chaque
 * envoi est « réservé » par un horodatage pris de façon atomique (`updateMany` conditionnel)
 * avant de partir, si bien que deux passages concurrents n'envoient jamais deux fois.
 *
 * - rappel unique « fin d'observation proche » à J-14 ;
 * - relance « observation échue » tous les 7 jours jusqu'à décision (D4) ;
 * - avertissement du PVS un mois avant l'effacement d'une candidature jamais traitée (D5) ;
 * - effacement des candidatures arrivées au terme de la durée de conservation.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ServingTasksResult = {
  endingReminders: number;
  overdueReminders: number;
  purgeWarnings: number;
  purged: number;
};

async function remindObservations(now: Date): Promise<{ ending: number; overdue: number }> {
  const soon = new Date(now.getTime() + ENDING_SOON_DAYS * DAY_MS);
  const relanceBefore = new Date(now.getTime() - OVERDUE_RELANCE_DAYS * DAY_MS);
  const rows = await prisma.servingAssignment.findMany({
    where: {
      status: "OBSERVATION",
      observationEndsAt: { not: null, lte: soon },
      OR: [{ observationEndsAt: { gt: now }, endingReminderAt: null }, { observationEndsAt: { lte: now } }],
    },
    include: {
      department: { select: { id: true, name: true } },
      application: { select: { id: true, churchId: true, firstName: true, lastName: true } },
    },
  });

  let ending = 0;
  let overdue = 0;
  for (const a of rows) {
    const isOverdue = a.observationEndsAt!.getTime() <= now.getTime();
    const { count } = await prisma.servingAssignment.updateMany({
      where: isOverdue
        ? { id: a.id, status: "OBSERVATION", OR: [{ overdueRemindedAt: null }, { overdueRemindedAt: { lte: relanceBefore } }] }
        : { id: a.id, status: "OBSERVATION", endingReminderAt: null },
      data: isOverdue ? { overdueRemindedAt: now } : { endingReminderAt: now },
    });
    if (count === 0) continue;
    try {
      await notifyObservationEnding(
        a.application.churchId,
        a.department.id,
        a.department.name,
        { applicationId: a.application.id, firstName: a.application.firstName, lastName: a.application.lastName },
        isOverdue
      );
      if (isOverdue) overdue++;
      else ending++;
    } catch (err) {
      logger.error({ err, assignmentId: a.id }, "Rappel de fin d'observation échoué");
    }
  }
  return { ending, overdue };
}

/**
 * Efface une candidature : la photo d'abord (suppression idempotente côté stockage), puis la
 * ligne (affectations en cascade) et ses notifications. Si la photo ne part pas, la ligne reste
 * et le passage suivant réessaie — aucune clé orpheline à suivre.
 */
async function purgeApplication(app: { id: string; churchId: string; photoKey: string }): Promise<boolean> {
  try {
    await deletePhoto(app.photoKey);
  } catch (err) {
    logger.error({ err, applicationId: app.id }, "Suppression de la photo de candidature échouée, nouvel essai au prochain passage");
    return false;
  }
  await prisma.servingApplication.delete({ where: { id: app.id } });
  await deleteItemNotifications(prisma, SERVING_ENTITY, app.id, [applicationLink(app.id)]);
  // Pas d'auteur (tâche planifiée) : trace technique, identifiant seul, aucune donnée de la fiche.
  logger.info({ applicationId: app.id, churchId: app.churchId }, "Candidature effacée au terme de sa conservation");
  return true;
}

async function retentionTasks(now: Date): Promise<{ warned: number; purged: number }> {
  const apps = await prisma.servingApplication.findMany({
    where: { assignments: { none: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } } } },
    select: {
      id: true,
      churchId: true,
      status: true,
      photoKey: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      decidedAt: true,
      purgeWarnedAt: true,
      assignments: { select: { status: true, decidedAt: true, resolvedAt: true } },
    },
  });

  const durations = new Map<string, number>();
  const pvs = new Map<string, string[]>();
  let warned = 0;
  let purged = 0;
  for (const app of apps) {
    if (!durations.has(app.churchId)) {
      durations.set(app.churchId, (await getServingDurations(app.churchId)).retentionMonths);
    }
    const deadline = retentionDeadline(app, durations.get(app.churchId)!);
    if (!deadline) continue;

    if (deadline.getTime() <= now.getTime()) {
      if (await purgeApplication(app)) purged++;
      continue;
    }

    // Avertissement : seulement pour une candidature jamais traitée (D5).
    if (app.status !== "RECEIVED" || app.purgeWarnedAt) continue;
    if (addMonths(deadline, -PURGE_WARNING_MONTHS).getTime() > now.getTime()) continue;
    const { count } = await prisma.servingApplication.updateMany({
      where: { id: app.id, status: "RECEIVED", purgeWarnedAt: null },
      data: { purgeWarnedAt: now },
    });
    if (count === 0) continue;
    if (!pvs.has(app.churchId)) pvs.set(app.churchId, await getPvsDepartmentIds(app.churchId));
    try {
      await notifyPurgeWarning(app.churchId, pvs.get(app.churchId)!, {
        applicationId: app.id,
        firstName: app.firstName,
        lastName: app.lastName,
      });
      warned++;
    } catch (err) {
      logger.error({ err, applicationId: app.id }, "Avertissement d'effacement de candidature échoué");
    }
  }
  return { warned, purged };
}

export async function runServingTasks(now: Date = new Date()): Promise<ServingTasksResult> {
  const reminders = await remindObservations(now);
  const retention = await retentionTasks(now);
  return {
    endingReminders: reminders.ending,
    overdueReminders: reminders.overdue,
    purgeWarnings: retention.warned,
    purged: retention.purged,
  };
}
