import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    await requireChurchPermission("planning:view", churchId);
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    // Get all events for this department in the time range
    let since: Date;
    let until: Date | undefined;

    if (fromParam) {
      since = new Date(fromParam);
      until = toParam ? new Date(toParam) : undefined;
    } else {
      since = new Date();
      since.setMonth(since.getMonth() - months);
    }

    const eventDepts = await prisma.eventDepartment.findMany({
      where: {
        departmentId,
        event: {
          date: {
            gte: since,
            ...(until ? { lte: until } : {}),
          },
        },
      },
      include: {
        event: { select: { id: true, title: true, date: true } },
        plannings: {
          include: {
            member: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { event: { date: "asc" } },
    });

    const totalEvents = eventDepts.length;

    // Per-member stats
    const memberStats = new Map<
      string,
      { name: string; services: number; indisponible: number }
    >();

    // Monthly trend
    const monthlyTrend = new Map<
      string,
      { month: string; enService: number; totalSlots: number }
    >();

    for (const ed of eventDepts) {
      const monthKey = `${ed.event.date.getFullYear()}-${String(ed.event.date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyTrend.has(monthKey)) {
        monthlyTrend.set(monthKey, {
          month: monthKey,
          enService: 0,
          totalSlots: 0,
        });
      }
      const trend = monthlyTrend.get(monthKey)!;

      for (const planning of ed.plannings) {
        const memberId = planning.member.id;
        if (!memberStats.has(memberId)) {
          memberStats.set(memberId, {
            name: `${planning.member.firstName} ${planning.member.lastName}`,
            services: 0,
            indisponible: 0,
          });
        }

        const stats = memberStats.get(memberId)!;
        trend.totalSlots++;

        if (
          planning.status === "EN_SERVICE" ||
          planning.status === "EN_SERVICE_DEBRIEF"
        ) {
          stats.services++;
          trend.enService++;
        } else if (planning.status === "INDISPONIBLE") {
          stats.indisponible++;
        }
      }
    }

    // Build response
    const members = Array.from(memberStats.entries())
      .map(([id, stats]) => ({
        id,
        name: stats.name,
        services: stats.services,
        indisponible: stats.indisponible,
        rate: totalEvents > 0 ? Math.round((stats.services / totalEvents) * 100) : 0,
      }))
      .sort((a, b) => b.services - a.services);

    const trend = Array.from(monthlyTrend.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // Task assignment stats
    const eventIds = eventDepts.map((ed) => ed.event.id);
    const taskAssignments = await prisma.taskAssignment.findMany({
      where: {
        eventId: { in: eventIds },
        task: { departmentId },
      },
      include: {
        task: { select: { id: true, name: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Per-task counts and per-member task breakdown
    const taskCounts = new Map<string, { name: string; count: number }>();
    const memberTaskMap = new Map<string, Map<string, number>>();

    for (const ta of taskAssignments) {
      // Task totals
      if (!taskCounts.has(ta.task.id)) {
        taskCounts.set(ta.task.id, { name: ta.task.name, count: 0 });
      }
      taskCounts.get(ta.task.id)!.count++;

      // Per-member breakdown
      const memberId = ta.member.id;
      if (!memberTaskMap.has(memberId)) {
        memberTaskMap.set(memberId, new Map());
      }
      const mtMap = memberTaskMap.get(memberId)!;
      mtMap.set(ta.task.id, (mtMap.get(ta.task.id) || 0) + 1);
    }

    const tasks = Array.from(taskCounts.entries())
      .map(([id, t]) => ({ id, name: t.name, count: t.count }))
      .sort((a, b) => b.count - a.count);

    const memberTasks = Array.from(memberTaskMap.entries())
      .map(([memberId, taskMap]) => {
        const mStat = memberStats.get(memberId);
        return {
          id: memberId,
          name: mStat?.name ?? memberId,
          tasks: Array.from(taskMap.entries()).map(([taskId, count]) => ({
            taskId,
            taskName: taskCounts.get(taskId)?.name ?? taskId,
            count,
          })),
          totalAssignments: Array.from(taskMap.values()).reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.totalAssignments - a.totalAssignments);

    return successResponse({
      department,
      totalEvents,
      months,
      members,
      trend,
      taskStats: { tasks, memberTasks },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
