import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildReminderEmail } from "@/lib/email";
import { createNotification, notifyUsers } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    // Protect with a secret token
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiError(401, "Unauthorized");
    }

    const now = new Date();
    const reminders = [1, 3]; // J-1 and J-3

    let emailsSent = 0;
    let notificationsCreated = 0;

    for (const daysAhead of reminders) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 86400000);

      // Find events happening in daysAhead days
      const events = await prisma.event.findMany({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
        },
        include: {
          eventDepts: {
            include: {
              department: true,
              plannings: {
                where: {
                  status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
                },
                include: {
                  member: true,
                },
              },
            },
          },
        },
      });

      // Batch-lookup des comptes utilisateurs liés aux membres concernés
      const allMemberIds = events.flatMap((e) =>
        e.eventDepts.flatMap((ed) => ed.plannings.map((p) => p.memberId))
      );
      const memberLinks = allMemberIds.length > 0
        ? await prisma.memberUserLink.findMany({
            where: { memberId: { in: allMemberIds }, validatedAt: { not: null } },
            select: { memberId: true, userId: true, user: { select: { email: true } } },
          })
        : [];
      const userByMember = new Map(memberLinks.map((l) => [l.memberId, { userId: l.userId, email: l.user.email }]));

      for (const event of events) {
        for (const eventDept of event.eventDepts) {
          for (const planning of eventDept.plannings) {
            const member = planning.member;
            const memberName = `${member.firstName} ${member.lastName}`;
            const linkedUser = userByMember.get(member.id);

            const { subject, html } = buildReminderEmail({
              memberName,
              eventTitle: event.title,
              eventDate: event.date.toISOString(),
              departmentName: eventDept.department.name,
              daysUntil: daysAhead,
            });

            // Compte lié (spec 053) : in-app + email gouverné par la préférence du domaine
            // "planning". Sans compte : email direct à `member.email`, inchangé.
            if (linkedUser) {
              await createNotification(
                {
                  userId: linkedUser.userId,
                  domain: "planning",
                  type: "PLANNING_REMINDER",
                  title: `Rappel : ${event.title}`,
                  message: `Vous êtes en service pour ${eventDept.department.name} ${daysAhead === 1 ? "demain" : `dans ${daysAhead} jours`}.`,
                  link: `/dashboard`,
                },
                linkedUser.email ? { email: { subject, html } } : undefined
              ).catch(() => {
                console.error("Failed to notify serving member (recipient redacted)");
              });
              emailsSent++;
              notificationsCreated++;
            } else if (process.env.SMTP_HOST && member.email) {
              try {
                await sendEmail({ to: member.email, subject, html });
                emailsSent++;
              } catch {
                console.error("Failed to send reminder email (recipient redacted)");
              }
            }

            // Notification in-app pour les responsables de département
            const deptHeads = await prisma.userDepartment.findMany({
              where: { departmentId: eventDept.departmentId },
              include: { userChurchRole: { select: { userId: true } } },
            });

            if (deptHeads.length > 0) {
              await notifyUsers(
                deptHeads.map((d) => d.userChurchRole.userId),
                {
                  domain: "planning",
                  type: "PLANNING_REMINDER",
                  title: `Rappel : ${event.title}`,
                  message: `${memberName} est en service pour ${eventDept.department.name} ${daysAhead === 1 ? "demain" : `dans ${daysAhead} jours`}.`,
                  link: `/dashboard?dept=${eventDept.departmentId}&event=${event.id}`,
                }
              );
              notificationsCreated += deptHeads.length;
            }
          }
        }
      }
    }

    return successResponse({
      emailsSent,
      notificationsCreated,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
