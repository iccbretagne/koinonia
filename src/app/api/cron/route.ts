import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildReminderEmail, buildPlanningDigestEmail } from "@/lib/email";

function authorizeCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ApiError(401, "Unauthorized");
  }
}

// ─── Task: reminders ─────────────────────────────────────────────────────────
// Envoie les rappels J-1 et J-3 aux membres en service.
// Ne s'exécute qu'une fois par jour par église (reminderLastSentAt).

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

  let emailsSent = 0;
  let notificationsCreated = 0;

  for (const church of churches) {
    const reminders = [1, 3];

    for (const daysAhead of reminders) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 86400000);

      const events = await prisma.event.findMany({
        where: {
          churchId: church.id,
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

      for (const event of events) {
        for (const eventDept of event.eventDepts) {
          for (const planning of eventDept.plannings) {
            const member = planning.member;
            const memberName = `${member.firstName} ${member.lastName}`;
            const { subject, html } = buildReminderEmail({
              memberName,
              eventTitle: event.title,
              eventDate: event.date.toISOString(),
              departmentName: eventDept.department.name,
              daysUntil: daysAhead,
            });

            if (process.env.SMTP_HOST && member.email) {
              try {
                await sendEmail({ to: member.email, subject, html });
                emailsSent++;
              } catch (err) {
                console.error("Failed to send reminder email (recipient redacted):", err instanceof Error ? err.message : err);
              }
            }

            const deptHeads = await prisma.userDepartment.findMany({
              where: { departmentId: eventDept.departmentId },
              include: { userChurchRole: { select: { userId: true } } },
            });

            for (const deptHead of deptHeads) {
              await prisma.notification.create({
                data: {
                  userId: deptHead.userChurchRole.userId,
                  type: "PLANNING_REMINDER",
                  title: `Rappel : ${event.title}`,
                  message: `${memberName} est en service pour ${eventDept.department.name} ${daysAhead === 1 ? "demain" : `dans ${daysAhead} jours`}`,
                  link: `/dashboard?dept=${eventDept.departmentId}&event=${event.id}`,
                },
              });
              notificationsCreated++;
            }
          }
        }
      }
    }

    await prisma.church.update({
      where: { id: church.id },
      data: { reminderLastSentAt: now },
    });
  }

  return { emailsSent, notificationsCreated };
}

// ─── Task: planning digest ────────────────────────────────────────────────────
// Envoie un digest des modifications de planning au secrétariat.
// S'exécute à chaque appel si des changements ont eu lieu depuis le dernier envoi.

async function runPlanningDigest() {
  const now = new Date();

  const churches = await prisma.church.findMany({
    where: { secretariatEmail: { not: null } },
  });

  let digestsSent = 0;

  for (const church of churches) {
    if (!church.secretariatEmail) continue;

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

    if (auditEntries.length === 0) continue;

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

    // Construire les changements pour le template
    const changes = auditEntries.flatMap((entry) => {
      const eventDept = eventDepts.find((ed) => ed.id === entry.entityId);
      if (!eventDept) return [];

      const modifiedBy =
        entry.user.displayName ?? entry.user.name ?? "Inconnu";

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

    if (changes.length === 0) continue;

    const { subject, html } = buildPlanningDigestEmail({
      churchName: church.name,
      changes,
      since,
    });

    if (process.env.SMTP_HOST) {
      try {
        await sendEmail({ to: church.secretariatEmail, subject, html });
        digestsSent++;
      } catch (err) {
        console.error(`Failed to send planning digest for church ${church.id}:`, err instanceof Error ? err.message : err);
      }
    }

    await prisma.church.update({
      where: { id: church.id },
      data: { planningDigestLastSentAt: now },
    });
  }

  return { digestsSent };
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    authorizeCron(request);

    const [remindersResult, digestResult] = await Promise.all([
      runReminders(),
      runPlanningDigest(),
    ]);

    return successResponse({
      reminders: remindersResult,
      planningDigest: digestResult,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
