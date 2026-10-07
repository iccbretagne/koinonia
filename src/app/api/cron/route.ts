import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildReminderEmail, buildPlanningDigestEmail, parseEmailList } from "@/lib/email";
import { registry } from "@/lib/registry";
import { createNotification, notifyUsers } from "@/lib/notifications";
import { runScheduledTasks, type CronTask, type CronTaskOutcome } from "@/lib/cron-scheduler";

/**
 * `/api/cron` est une adresse du **noyau** (spec 038, `NOYAU_ROUTES`) : elle répond
 * toujours, quels que soient les modules actifs — c'est le proxy qui la laisse toujours
 * passer. Mais les traitements qu'elle déclenche appartiennent, eux, à des modules
 * optionnels : sur une instance sans `integration`/`jobs`, aucun de leurs travaux planifiés
 * ne doit s'exécuter (« ne pas créer de donnée pour un module absent »). D'où l'import
 * dynamique, gardé par `registry.has(...)`, plutôt que l'import statique précédent.
 */
async function runIntegrationInactivityTasks(appUrl: string) {
  if (!registry.has("integration")) return null;
  const { runInactivityNotifications, runWaitingRelanceNotifications } = await import(
    "@/modules/integration"
  );
  const [integrationInactivityResult, integrationRelanceResult] = await Promise.all([
    runInactivityNotifications(appUrl),
    runWaitingRelanceNotifications(appUrl),
  ]);
  return { integrationInactivityResult, integrationRelanceResult };
}

/**
 * Rappels d'inactivité des suivis MSDP (repris par `care`, ex-`integration`) et relances des
 * demandes de rendez-vous pastoral non confiées/confiées sans date (spec 052, T60). Un seul
 * import dynamique pour les deux, comme `runIntegrationInactivityTasks` ci-dessus.
 */
async function runCareTasks(appUrl: string) {
  if (!registry.has("care")) return null;
  const { runMsdpInactivityNotifications, runCareRelances } = await import("@/modules/care");
  const [msdpInactivityResult, careRelanceResult] = await Promise.all([
    runMsdpInactivityNotifications(appUrl),
    runCareRelances(),
  ]);
  return { msdpInactivityResult, careRelanceResult };
}

async function runJobsLifecycleTask(appUrl: string) {
  if (!registry.has("jobs")) return null;
  const { runJobOffersLifecycle } = await import("@/modules/jobs");
  return runJobOffersLifecycle(appUrl);
}

/** Collecte des disponibilités (spec 058) : ouverture, demandes ciblées, relances. Module planning (noyau). */
async function runAvailabilityTasks() {
  const { runAvailabilityTasks: run } = await import("@/modules/planning");
  return run();
}

/** Récapitulatifs des changements de planning (spec 060) : un seul message par STAR, après le délai de son église. */
async function runPlanningChangeNotices() {
  const { flushPlanningChangeNotices } = await import("@/modules/planning");
  return flushPlanningChangeNotices();
}

function authorizeCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ApiError(401, "Unauthorized");
  }
}

// ─── Task: integration inactivity ────────────────────────────────────────────
// Délégué au service du module integration.

// ─── Task: reminders ─────────────────────────────────────────────────────────
// Envoie les rappels J-1 et J-3 aux membres en service.
// Ne s'exécute qu'une fois par jour par église (reminderLastSentAt).

type ReminderCounts = { emailsSent: number; notificationsCreated: number };

type ReminderEvent = Awaited<ReturnType<typeof loadReminderEvents>>[number];
type ReminderEventDept = ReminderEvent["eventDepts"][number];
type ReminderPlanning = ReminderEventDept["plannings"][number];

function loadReminderEvents(churchId: string, startOfDay: Date, endOfDay: Date) {
  return prisma.event.findMany({
    where: {
      churchId,
      date: { gte: startOfDay, lt: endOfDay },
    },
    include: {
      eventDepts: {
        include: {
          department: true,
          plannings: {
            where: { status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] } },
            include: { member: true },
          },
        },
      },
    },
  });
}

/**
 * Batch-lookup des comptes utilisateurs liés aux membres concernés (spec 053) : un membre
 * avec un compte lié reçoit son rappel via le mécanisme de préférence (domaine "planning") ;
 * un membre sans compte reste sur l'email direct à `member.email`, inchangé (T26).
 */
async function linkedUserIdsByMember(events: ReminderEvent[]): Promise<Map<string, string>> {
  const allMemberIds = events.flatMap((e) => e.eventDepts.flatMap((ed) => ed.plannings.map((p) => p.memberId)));
  if (allMemberIds.length === 0) return new Map();
  const memberLinks = await prisma.memberUserLink.findMany({
    where: { memberId: { in: allMemberIds }, validatedAt: { not: null } },
    select: { memberId: true, userId: true },
  });
  return new Map(memberLinks.map((l) => [l.memberId, l.userId]));
}

/** Rappel au STAR en service : notification (et email selon ses préférences) s'il a un compte, sinon email direct. */
async function remindServingMember(
  event: ReminderEvent,
  eventDept: ReminderEventDept,
  planning: ReminderPlanning,
  daysAhead: number,
  whenLabel: string,
  linkedUserId: string | null,
  counts: ReminderCounts
) {
  const member = planning.member;
  const { subject, html } = buildReminderEmail({
    memberName: `${member.firstName} ${member.lastName}`,
    eventTitle: event.title,
    eventDate: event.date.toISOString(),
    departmentName: eventDept.department.name,
    daysUntil: daysAhead,
  });

  if (linkedUserId) {
    await createNotification(
      {
        userId: linkedUserId,
        domain: "planning",
        type: "PLANNING_REMINDER",
        title: `Rappel : ${event.title}`,
        message: `Vous êtes en service pour ${eventDept.department.name} ${whenLabel}.`,
        link: `/dashboard`,
      },
      member.email ? { email: { subject, html } } : undefined
    ).catch((err) => {
      console.error("Failed to notify serving member (recipient redacted):", err instanceof Error ? err.message : err);
    });
    counts.emailsSent++;
    counts.notificationsCreated++;
  } else if (process.env.SMTP_HOST && member.email) {
    try {
      await sendEmail({ to: member.email, subject, html });
      counts.emailsSent++;
    } catch (err) {
      console.error("Failed to send reminder email (recipient redacted):", err instanceof Error ? err.message : err);
    }
  }
}

/** Rappel aux responsables du département : qui est en service et quand. */
async function remindDeptHeads(
  event: ReminderEvent,
  eventDept: ReminderEventDept,
  planning: ReminderPlanning,
  whenLabel: string,
  counts: ReminderCounts
) {
  const deptHeads = await prisma.userDepartment.findMany({
    where: { departmentId: eventDept.departmentId },
    include: { userChurchRole: { select: { userId: true } } },
  });
  if (deptHeads.length === 0) return;
  await notifyUsers(deptHeads.map((d) => d.userChurchRole.userId), {
    domain: "planning",
    type: "PLANNING_REMINDER",
    title: `Rappel : ${event.title}`,
    message: `${planning.member.firstName} ${planning.member.lastName} est en service pour ${eventDept.department.name} ${whenLabel}`,
    link: `/dashboard?dept=${eventDept.departmentId}&event=${event.id}`,
  });
  counts.notificationsCreated += deptHeads.length;
}

/** Rappels des services d'une église pour le jour situé `daysAhead` jours après `now`. */
async function remindDay(churchId: string, now: Date, daysAhead: number, counts: ReminderCounts) {
  const targetDate = new Date(now);
  const whenLabel = daysAhead === 1 ? "demain" : `dans ${daysAhead} jours`;
  targetDate.setDate(targetDate.getDate() + daysAhead);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const events = await loadReminderEvents(churchId, startOfDay, endOfDay);
  const linkedUserIdByMember = await linkedUserIdsByMember(events);

  for (const event of events) {
    for (const eventDept of event.eventDepts) {
      for (const planning of eventDept.plannings) {
        const linkedUserId = linkedUserIdByMember.get(planning.member.id) ?? null;
        await remindServingMember(event, eventDept, planning, daysAhead, whenLabel, linkedUserId, counts);
        await remindDeptHeads(event, eventDept, planning, whenLabel, counts);
      }
    }
  }
}

async function runReminders() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const churches = await prisma.church.findMany({
    where: {
      OR: [
        { reminderLastSentAt: null },
        { reminderLastSentAt: { lt: startOfToday } },
      ],
    },
  });

  const counts: ReminderCounts = { emailsSent: 0, notificationsCreated: 0 };
  for (const church of churches) {
    for (const daysAhead of [1, 3]) await remindDay(church.id, now, daysAhead, counts);
    await prisma.church.update({
      where: { id: church.id },
      data: { reminderLastSentAt: now },
    });
  }

  return counts;
}

// ─── Task: planning digest ────────────────────────────────────────────────────
// Envoie un digest des modifications de planning au secrétariat.
// S'exécute à chaque appel si des changements ont eu lieu depuis le dernier envoi.

type DigestEventDept = {
  id: string;
  event: { title: string; date: Date };
  department: { name: string };
  plannings: { status: string | null; member: { firstName: string; lastName: string } }[];
};

/** Changements à présenter dans le digest : l'état courant de chaque département modifié. */
function digestChanges(
  auditEntries: { entityId: string; user: { displayName: string | null; name: string | null } }[],
  eventDepts: DigestEventDept[]
) {
  return auditEntries.flatMap((entry) => {
    const eventDept = eventDepts.find((ed) => ed.id === entry.entityId);
    if (!eventDept) return [];
    const modifiedBy = entry.user.displayName ?? entry.user.name ?? "Inconnu";
    return eventDept.plannings.map((planning) => ({
      memberName: `${planning.member.firstName} ${planning.member.lastName}`,
      departmentName: eventDept.department.name,
      eventTitle: eventDept.event.title,
      eventDate: eventDept.event.date.toISOString(),
      changeType: "updated" as const,
      newStatus: planning.status,
      modifiedBy,
    }));
  });
}

type DigestChurch = { id: string; name: string; secretariatEmails: string | null; planningDigestLastSentAt: Date | null };

/**
 * Digest d'une église : les changements de planning depuis le dernier envoi. Renvoie `true` si
 * l'email est parti ; la date d'envoi n'avance que s'il y avait des changements à présenter.
 */
async function sendChurchDigest(church: DigestChurch, now: Date): Promise<boolean> {
  const emails = parseEmailList(church.secretariatEmails);
  if (emails.length === 0) return false;

  const since = church.planningDigestLastSentAt ?? new Date(0);

  // Récupérer les entrées d'audit Planning depuis le dernier digest
  const auditEntries = await prisma.auditLog.findMany({
    where: {
      churchId: church.id,
      entityType: "Planning",
      createdAt: { gt: since },
    },
    include: { user: { select: { name: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (auditEntries.length === 0) return false;

  // Récupérer l'état courant du planning pour les événements/depts concernés
  const affectedEventDeptIds = [...new Set(auditEntries.map((a) => a.entityId))];
  const eventDepts = await prisma.eventDepartment.findMany({
    where: { id: { in: affectedEventDeptIds } },
    include: {
      event: true,
      department: true,
      plannings: {
        include: { member: true },
      },
    },
  });

  const changes = digestChanges(auditEntries, eventDepts);
  if (changes.length === 0) return false;

  const { subject, html } = buildPlanningDigestEmail({
    churchName: church.name,
    changes,
    since,
  });

  let sent = false;
  if (process.env.SMTP_HOST) {
    try {
      await sendEmail({ to: emails, subject, html });
      sent = true;
    } catch (err) {
      console.error(`Failed to send planning digest for church ${church.id}:`, err instanceof Error ? err.message : err);
    }
  }

  await prisma.church.update({
    where: { id: church.id },
    data: { planningDigestLastSentAt: now },
  });
  return sent;
}

async function runPlanningDigest() {
  const now = new Date();
  const churches = await prisma.church.findMany({
    where: { secretariatEmails: { not: null } },
  });

  let digestsSent = 0;
  for (const church of churches) {
    if (await sendChurchDigest(church, now)) digestsSent++;
  }
  return { digestsSent };
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
// Appelé toutes les 5 minutes par le minuteur systemd ; chaque tâche ne s'exécute que
// lorsqu'elle est due selon son rythme (planificateur, ADR-0021). Une tâche d'un module
// désactivé n'est pas déclarée du tout : elle ne crée aucune ligne de suivi.

function cronTasks(appUrl: string): CronTask[] {
  const tasks: (CronTask & { module?: string })[] = [
    // Rappels J-1/J-3 : une fois par jour (le garde `reminderLastSentAt` par église demeure).
    { key: "reminders", schedule: { kind: "daily", hour: 0 }, run: runReminders },
    // Récapitulatif secrétariat : envoie tout changement depuis le précédent, donc horaire.
    { key: "planning-digest", schedule: { kind: "interval", minutes: 60 }, run: runPlanningDigest },
    {
      key: "integration-inactivity",
      module: "integration",
      schedule: { kind: "interval", minutes: 60 },
      run: () => runIntegrationInactivityTasks(appUrl),
    },
    { key: "care", module: "care", schedule: { kind: "interval", minutes: 60 }, run: () => runCareTasks(appUrl) },
    { key: "jobs-lifecycle", module: "jobs", schedule: { kind: "interval", minutes: 60 }, run: () => runJobsLifecycleTask(appUrl) },
    // Le délai de regroupement est réglé par église ; le passage de 5 minutes borne la précision.
    { key: "planning-change-notices", schedule: { kind: "every-run" }, run: runPlanningChangeNotices },
    // Idempotente (horodatages) : un rythme plus serré ne fait qu'améliorer la réactivité.
    { key: "availability", schedule: { kind: "interval", minutes: 15 }, run: runAvailabilityTasks },
  ];
  return tasks.filter((t) => !t.module || registry.has(t.module));
}

function resultOf<T>(outcome: CronTaskOutcome | undefined): T | null {
  return outcome?.status === "ran" ? (outcome.result as T) : null;
}

export async function POST(request: Request) {
  try {
    authorizeCron(request);

    const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
    const outcomes = await runScheduledTasks(cronTasks(appUrl));

    const integration = resultOf<Awaited<ReturnType<typeof runIntegrationInactivityTasks>>>(outcomes["integration-inactivity"]);
    const care = resultOf<Awaited<ReturnType<typeof runCareTasks>>>(outcomes["care"]);

    return successResponse({
      tasks: Object.fromEntries(Object.entries(outcomes).map(([key, o]) => [key, o.status])),
      reminders: resultOf(outcomes["reminders"]),
      planningDigest: resultOf(outcomes["planning-digest"]),
      integrationInactivity: integration?.integrationInactivityResult ?? null,
      integrationRelance: integration?.integrationRelanceResult ?? null,
      msdpInactivity: care?.msdpInactivityResult ?? null,
      careRelance: care?.careRelanceResult ?? null,
      jobOffersLifecycle: resultOf(outcomes["jobs-lifecycle"]),
      availability: resultOf(outcomes["availability"]),
      planningChangeNotices: resultOf(outcomes["planning-change-notices"]),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
