import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { deleteItemNotifications } from "@/lib/notifications";
import { getPvsDepartmentIds } from "../auth";
import { getServingDurations } from "./settings";
import { deletePhoto } from "./photo";
import {
  applicationLink,
  emailSlotsInvitation,
  notifyInterviewCancelled,
  notifyInterviewReminder,
  notifyInterviewToComplete,
  notifyObservationEnding,
  notifyPurgeWarning,
  notifySchedulingReminder,
  SERVING_ENTITY,
} from "./notifications";
import { interviewEnd, loadCandidate, toInfo } from "./interviews";
import { parisParts } from "@/lib/paris-time";
import { SCHEDULING_REASON_LABEL } from "../schemas";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  addMonths,
  ENDING_SOON_DAYS,
  OVERDUE_RELANCE_DAYS,
  PURGE_WARNING_MONTHS,
  retentionDeadline,
} from "./state";

/**
 * Cycle de vie des candidatures (spec 077), tâche cron horaire `serving`. Idempotente : chaque
 * envoi est « réservé » par un horodatage pris de façon atomique (`updateMany` conditionnel)
 * avant de partir, si bien que deux passages concurrents n'envoient jamais deux fois.
 *
 * - rappel unique « fin d'observation proche » à J-14 ;
 * - relance « observation échue » tous les 7 jours jusqu'à décision (D4) ;
 * - avertissement du PVS un mois avant l'effacement d'une candidature jamais traitée (D5) ;
 * - effacement des candidatures arrivées au terme de la durée de conservation ;
 * - entretiens (spec 082) : rappel de la veille, issue à noter, relance « À planifier »,
 *   invitation après ouverture de créneaux.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ServingTasksResult = {
  interviewReminders: number;
  completionReminders: number;
  schedulingReminders: number;
  slotsInvitations: number;
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
  const pvs = new Map<string, string[]>();
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
      const churchId = a.application.churchId;
      if (!pvs.has(churchId)) pvs.set(churchId, await getPvsDepartmentIds(churchId));
      await notifyObservationEnding(
        churchId,
        a.department.id,
        a.department.name,
        { applicationId: a.application.id, firstName: a.application.firstName, lastName: a.application.lastName },
        isOverdue,
        pvs.get(churchId)!
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
  // Rendez-vous à venir : créneau libéré, personne qui reçoit prévenue, aucun message au candidat.
  const booked = await prisma.servingInterview.findFirst({ where: { applicationId: app.id, status: "BOOKED", startsAt: { gt: new Date() } } });
  if (booked) {
    const candidate = await loadCandidate(app.id);
    if (booked.slotId) await prisma.servingInterviewSlot.updateMany({ where: { id: booked.slotId }, data: { bookedAt: null } });
    await notifyInterviewCancelled(candidate, toInfo(booked), "PURGED").catch((err) =>
      logger.error({ err, applicationId: app.id }, "Annulation d'entretien à l'effacement non notifiée")
    );
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

// ── Entretiens (spec 082) ───────────────────────────────────────────────────

/** Rappel de la veille : rendez-vous réservés qui ont lieu demain (jour de Paris). */
async function remindDayBefore(now: Date): Promise<number> {
  const tomorrow = parisParts(new Date(now.getTime() + DAY_MS)).day;
  const rows = await prisma.servingInterview.findMany({
    where: { status: "BOOKED", dayBeforeRemindedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY_MS) } },
  });
  let sent = 0;
  for (const i of rows.filter((r) => parisParts(r.startsAt).day === tomorrow)) {
    const { count } = await prisma.servingInterview.updateMany({ where: { id: i.id, dayBeforeRemindedAt: null, status: "BOOKED" }, data: { dayBeforeRemindedAt: now } });
    if (count === 0) continue;
    try {
      await notifyInterviewReminder(await loadCandidate(i.applicationId), toInfo(i));
      sent++;
    } catch (err) {
      logger.error({ err, interviewId: i.id }, "Rappel d'entretien échoué");
    }
  }
  return sent;
}

/** Issue à noter : entretien réservé terminé depuis au moins 12 h, une seule fois. */
async function remindCompletion(now: Date): Promise<number> {
  const rows = await prisma.servingInterview.findMany({
    where: { status: "BOOKED", completionRemindedAt: null, startsAt: { lt: now } },
  });
  let sent = 0;
  for (const i of rows.filter((r) => interviewEnd(r).getTime() + 12 * 3_600_000 <= now.getTime())) {
    const { count } = await prisma.servingInterview.updateMany({ where: { id: i.id, completionRemindedAt: null, status: "BOOKED" }, data: { completionRemindedAt: now } });
    if (count === 0) continue;
    try {
      await notifyInterviewToComplete(await loadCandidate(i.applicationId), toInfo(i));
      sent++;
    } catch (err) {
      logger.error({ err, interviewId: i.id }, "Rappel d'issue d'entretien échoué");
    }
  }
  return sent;
}

/** Relance « À planifier » : candidature encore à l'étude, au délai de l'église, renouvelée. */
async function remindScheduling(now: Date): Promise<number> {
  const rows = await prisma.servingApplication.findMany({
    where: { status: "RECEIVED", schedulingReason: { not: null }, schedulingSince: { not: null } },
    select: { id: true, churchId: true, schedulingReason: true, schedulingSince: true, schedulingRemindedAt: true },
  });
  const delays = new Map<string, number>();
  let sent = 0;
  for (const app of rows) {
    if (!app.schedulingReason || !app.schedulingSince) continue;
    if (!delays.has(app.churchId)) delays.set(app.churchId, (await getServingDurations(app.churchId)).schedulingReminderDays);
    const delayMs = delays.get(app.churchId)! * DAY_MS;
    const last = app.schedulingRemindedAt ?? app.schedulingSince!;
    if (last.getTime() + delayMs > now.getTime()) continue;
    const { count } = await prisma.servingApplication.updateMany({
      where: { id: app.id, schedulingReason: app.schedulingReason, schedulingRemindedAt: app.schedulingRemindedAt },
      data: { schedulingRemindedAt: now },
    });
    if (count === 0) continue;
    try {
      await notifySchedulingReminder(await loadCandidate(app.id), SCHEDULING_REASON_LABEL[app.schedulingReason!]);
      sent++;
    } catch (err) {
      logger.error({ err, applicationId: app.id }, "Relance « À planifier » échouée");
    }
  }
  return sent;
}

/**
 * Nouveaux créneaux ouverts : les candidatures « À planifier » (avec email, encore à l'étude) sont
 * invitées à choisir, au plus une fois par 24 h, s'il reste un créneau libre dans leur église.
 */
async function inviteToNewSlots(now: Date): Promise<number> {
  const churches = await prisma.servingSettings.findMany({ where: { slotsOpenedAt: { not: null } }, select: { churchId: true, slotsOpenedAt: true } });
  let sent = 0;
  for (const church of churches) {
    const free = await prisma.servingInterviewSlot.count({ where: { churchId: church.churchId, bookedAt: null, startsAt: { gt: now }, interviewerId: { not: null } } });
    if (free === 0) continue;
    const apps = await prisma.servingApplication.findMany({
      where: {
        churchId: church.churchId,
        status: "RECEIVED",
        schedulingReason: { not: null },
        email: { not: null },
        manageSalt: { not: null },
        OR: [{ slotsInvitedAt: null }, { slotsInvitedAt: { lt: church.slotsOpenedAt! } }],
      },
      select: { id: true, slotsInvitedAt: true },
    });
    for (const app of apps) {
      if (app.slotsInvitedAt && app.slotsInvitedAt.getTime() + DAY_MS > now.getTime()) continue;
      const { count } = await prisma.servingApplication.updateMany({
        where: { id: app.id, slotsInvitedAt: app.slotsInvitedAt },
        data: { slotsInvitedAt: now },
      });
      if (count === 0) continue;
      try {
        await emailSlotsInvitation(await loadCandidate(app.id));
        sent++;
      } catch (err) {
        logger.error({ err, applicationId: app.id }, "Invitation aux nouveaux créneaux échouée");
      }
    }
  }
  return sent;
}

export async function runServingTasks(now: Date = new Date()): Promise<ServingTasksResult> {
  const reminders = await remindObservations(now);
  const retention = await retentionTasks(now);
  const interviewReminders = await remindDayBefore(now);
  const completionReminders = await remindCompletion(now);
  const schedulingReminders = await remindScheduling(now);
  const slotsInvitations = await inviteToNewSlots(now);
  return {
    interviewReminders,
    completionReminders,
    schedulingReminders,
    slotsInvitations,
    endingReminders: reminders.ending,
    overdueReminders: reminders.overdue,
    purgeWarnings: retention.warned,
    purged: retention.purged,
  };
}
