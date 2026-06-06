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

// ─── Task: integration inactivity ────────────────────────────────────────────
// Notifie les responsables pour chaque demande d'intégration inactive depuis 7+ jours.

async function runIntegrationInactivity() {
  const INACTIVITY_DAYS = 7;
  const NOTIF_TYPE = "INTEGRATION_INACTIVITY";

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - INACTIVITY_DAYS);

  const dedupeThreshold = new Date();
  dedupeThreshold.setDate(dedupeThreshold.getDate() - INACTIVITY_DAYS);

  const staleRequests = await prisma.familyIntegrationRequest.findMany({
    where: {
      archivedAt: null,
      status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED"] },
      updatedAt: { lt: threshold },
    },
    include: {
      assignedBerger: { select: { id: true, name: true, email: true } },
      church: { select: { id: true, name: true } },
    },
  });

  if (staleRequests.length === 0) return { notified: 0, skipped: 0 };

  const requestIds = staleRequests.map((r) => r.id);
  const recentNotifs = await prisma.notification.findMany({
    where: {
      type: NOTIF_TYPE,
      link: { in: requestIds.map((id) => `/integration/requests/${id}`) },
      createdAt: { gte: dedupeThreshold },
    },
    select: { link: true },
  });
  const alreadyNotifiedLinks = new Set(recentNotifs.map((n) => n.link));

  const managersByChurch: Record<string, { id: string; email: string | null }[]> = {};

  async function getManagers(churchId: string) {
    if (managersByChurch[churchId]) return managersByChurch[churchId];
    const integrationDept = await prisma.department.findFirst({
      where: { function: "INTEGRATION", ministry: { churchId } },
      select: { id: true },
    });
    if (!integrationDept) { managersByChurch[churchId] = []; return []; }
    const memberships = await prisma.userDepartment.findMany({
      where: { departmentId: integrationDept.id },
      include: { userChurchRole: { select: { userId: true, user: { select: { id: true, email: true } } } } },
    });
    const managers = memberships.map((m) => ({ id: m.userChurchRole.userId, email: m.userChurchRole.user.email }));
    managersByChurch[churchId] = managers;
    return managers;
  }

  const titleMap: Record<string, string> = {
    SUBMITTED: "Demande sans suite depuis 7 jours",
    ASSIGNED: "Contact non établi depuis 7 jours",
    CONTACTED: "Suivi en attente depuis 7 jours",
  };

  let notified = 0;
  let skipped = 0;

  for (const req of staleRequests) {
    const link = `/integration/requests/${req.id}`;
    if (alreadyNotifiedLinks.has(link)) { skipped++; continue; }

    const personName = `${req.firstName} ${req.lastName}`;
    const daysSince = Math.floor((Date.now() - req.updatedAt.getTime()) / 86_400_000);
    const title = titleMap[req.status] ?? "Demande inactive";
    const message = `${personName} — aucune mise à jour depuis ${daysSince} jours.`;

    if (req.status === "SUBMITTED") {
      const managers = await getManagers(req.churchId);
      for (const manager of managers) {
        await prisma.notification.create({
          data: { userId: manager.id, type: NOTIF_TYPE, title, message, link },
        });
        notified++;
        if (process.env.SMTP_HOST && manager.email) {
          await sendEmail({
            to: manager.email,
            subject: `${req.church.name} — ${title}`,
            html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link }),
          }).catch(() => {});
        }
      }
    } else if (req.assignedBerger) {
      await prisma.notification.create({
        data: { userId: req.assignedBerger.id, type: NOTIF_TYPE, title, message, link },
      });
      notified++;
      if (process.env.SMTP_HOST && req.assignedBerger.email) {
        await sendEmail({
          to: req.assignedBerger.email,
          subject: `${req.church.name} — ${title}`,
          html: buildInactivityEmail({ churchName: req.church.name, personName, status: req.status, daysSince, link }),
        }).catch(() => {});
      }
    }
  }

  return { notified, skipped, total: staleRequests.length };
}

function buildInactivityEmail(params: {
  churchName: string;
  personName: string;
  status: string;
  daysSince: number;
  link: string;
}): string {
  const { churchName, personName, status, daysSince, link } = params;
  const contextMap: Record<string, string> = {
    SUBMITTED: "La demande n'a pas encore été affectée à une famille.",
    ASSIGNED: "La demande a été affectée mais le contact n'a pas encore été établi.",
    CONTACTED: "Le contact a été établi mais aucune progression n'a été enregistrée.",
  };
  const context = contextMap[status] ?? "Aucune mise à jour récente.";
  const appUrl = process.env.NEXTAUTH_URL ?? "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">${churchName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Rappel — Intégration familles</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 12px;color:#111827;font-size:15px">Bonjour,</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        La demande de <strong>${personName}</strong> est inactive depuis <strong>${daysSince} jours</strong>.
      </p>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#92400e;font-size:13px">${context}</p>
      </div>
      <a href="${appUrl}${link}" style="display:inline-block;background:#5E17EB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">Voir la demande →</a>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Message automatique. Ne pas répondre directement.</p>
    </div>
  </div>
</body></html>`;
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

    const [remindersResult, digestResult, integrationInactivityResult] = await Promise.all([
      runReminders(),
      runPlanningDigest(),
      runIntegrationInactivity(),
    ]);

    return successResponse({
      reminders: remindersResult,
      planningDigest: digestResult,
      integrationInactivity: integrationInactivityResult,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
