import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    await requireAuth();
    const { departmentId } = await params;

    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");

    // Default to current month
    const now = new Date();
    const year = monthParam
      ? parseInt(monthParam.split("-")[0])
      : now.getFullYear();
    const month = monthParam
      ? parseInt(monthParam.split("-")[1]) - 1
      : now.getMonth();

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const eventDepartments = await prisma.eventDepartment.findMany({
      where: {
        departmentId,
        event: {
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      },
      include: {
        event: true,
        plannings: {
          where: {
            status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
          },
          include: {
            member: true,
          },
        },
      },
      orderBy: {
        event: { date: "asc" },
      },
    });

    // Fetch task assignments for all events in the month
    const eventIds = eventDepartments.map((ed) => ed.event.id);
    const taskAssignments = await prisma.taskAssignment.findMany({
      where: {
        eventId: { in: eventIds },
        task: { departmentId },
      },
      include: {
        task: { select: { name: true } },
      },
    });

    // Build a map: eventId -> memberId -> task names
    const taskMap = new Map<string, Map<string, string[]>>();
    for (const ta of taskAssignments) {
      if (!taskMap.has(ta.eventId)) taskMap.set(ta.eventId, new Map());
      const memberTasks = taskMap.get(ta.eventId)!;
      if (!memberTasks.has(ta.memberId)) memberTasks.set(ta.memberId, []);
      memberTasks.get(ta.memberId)!.push(ta.task.name);
    }

    const events = eventDepartments.map((ed) => ({
      id: ed.event.id,
      title: ed.event.title,
      date: ed.event.date.toISOString(),
      members: ed.plannings.map((p) => ({
        id: p.member.id,
        firstName: p.member.firstName,
        lastName: p.member.lastName,
        status: p.status,
        tasks: taskMap.get(ed.event.id)?.get(p.member.id) ?? [],
      })),
    }));

    return successResponse({ events });
  } catch (error) {
    return errorResponse(error);
  }
}
