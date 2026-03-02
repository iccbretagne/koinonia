import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, buildReminderEmail } from "@/lib/email";

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
                  member: {
                    include: {
                      department: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      for (const event of events) {
        for (const eventDept of event.eventDepts) {
          for (const planning of eventDept.plannings) {
            const member = planning.member;

            // Create in-app notification
            // Find the user linked to this member via email match (best effort)
            const user = await prisma.user.findFirst({
              where: {
                email: { not: undefined },
                churchRoles: { some: {} },
              },
              // In a real app, Member should have a userId field
              // For now, we send to all users who have the same name
            });

            // Create in-app notification for all users with planning:view
            // (simplified: create for users with churchRoles in the same church)
            const memberName = `${member.firstName} ${member.lastName}`;
            const { subject, html } = buildReminderEmail({
              memberName,
              eventTitle: event.title,
              eventDate: event.date.toISOString(),
              departmentName: eventDept.department.name,
              daysUntil: daysAhead,
            });

            // Send email if SMTP is configured
            if (process.env.SMTP_HOST && member.email) {
              try {
                await sendEmail({ to: member.email, subject, html });
                emailsSent++;
              } catch {
                console.error(`Failed to send email to ${member.email}`);
              }
            }

            // Create in-app notification for department heads
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

    return successResponse({
      emailsSent,
      notificationsCreated,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
