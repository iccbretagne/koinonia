import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId, requireDepartmentAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

/** Période : `from`/`to` explicites, sinon les `months` derniers mois. */
function statsRange(fromParam: string | null, toParam: string | null, months: number): { since: Date; until?: Date } {
  if (fromParam) return { since: new Date(fromParam), until: toParam ? new Date(toParam) : undefined };
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  return { since };
}

type MemberStat = { name: string; services: number; indisponible: number };
type StatsEventDept = {
  event: { date: Date };
  plannings: { status: string | null; member: { id: string; firstName: string; lastName: string } }[];
};

const monthKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** Services et indisponibilités par STAR, et taux de service par mois. */
function serviceStats(eventDepts: StatsEventDept[]) {
  const memberStats = new Map<string, MemberStat>();
  const monthlyTrend = new Map<string, { month: string; enService: number; totalSlots: number }>();

  for (const ed of eventDepts) {
    const monthKey = monthKeyOf(ed.event.date);
    const trend = monthlyTrend.get(monthKey) ?? { month: monthKey, enService: 0, totalSlots: 0 };
    monthlyTrend.set(monthKey, trend);

    for (const planning of ed.plannings) {
      const member = planning.member;
      const stats = memberStats.get(member.id) ?? { name: `${member.firstName} ${member.lastName}`, services: 0, indisponible: 0 };
      memberStats.set(member.id, stats);
      trend.totalSlots++;
      if (planning.status === "EN_SERVICE" || planning.status === "EN_SERVICE_DEBRIEF") {
        stats.services++;
        trend.enService++;
      } else if (planning.status === "INDISPONIBLE") {
        stats.indisponible++;
      }
    }
  }

  const trend = Array.from(monthlyTrend.values()).sort((a, b) => a.month.localeCompare(b.month));
  return { memberStats, trend };
}

/** Nombre d'affectations par tâche, et répartition par STAR. */
function taskStats(
  taskAssignments: { task: { id: string; name: string }; member: { id: string } }[],
  memberStats: Map<string, MemberStat>
) {
  const taskCounts = new Map<string, { name: string; count: number }>();
  const memberTaskMap = new Map<string, Map<string, number>>();

  for (const ta of taskAssignments) {
    const taskCount = taskCounts.get(ta.task.id) ?? { name: ta.task.name, count: 0 };
    taskCount.count++;
    taskCounts.set(ta.task.id, taskCount);

    const mtMap = memberTaskMap.get(ta.member.id) ?? new Map<string, number>();
    mtMap.set(ta.task.id, (mtMap.get(ta.task.id) || 0) + 1);
    memberTaskMap.set(ta.member.id, mtMap);
  }

  const tasks = Array.from(taskCounts.entries())
    .map(([id, t]) => ({ id, name: t.name, count: t.count }))
    .sort((a, b) => b.count - a.count);

  const memberTasks = Array.from(memberTaskMap.entries())
    .map(([memberId, taskMap]) => ({
      id: memberId,
      name: memberStats.get(memberId)?.name ?? memberId,
      tasks: Array.from(taskMap.entries()).map(([taskId, count]) => ({
        taskId,
        taskName: taskCounts.get(taskId)?.name ?? taskId,
        count,
      })),
      totalAssignments: Array.from(taskMap.values()).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.totalAssignments - a.totalAssignments);

  return { tasks, memberTasks };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("planning:department", churchId);
    requireDepartmentAccess(session, churchId, departmentId);
    const { searchParams } = new URL(request.url);
    const months = Number.parseInt(searchParams.get("months") || "6");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    const { since, until } = statsRange(fromParam, toParam, months);

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
    const { memberStats, trend } = serviceStats(eventDepts);
    const members = Array.from(memberStats.entries())
      .map(([id, stats]) => ({
        id,
        name: stats.name,
        services: stats.services,
        indisponible: stats.indisponible,
        rate: totalEvents > 0 ? Math.round((stats.services / totalEvents) * 100) : 0,
      }))
      .sort((a, b) => b.services - a.services);

    // Task assignment stats
    const taskAssignments = await prisma.taskAssignment.findMany({
      where: {
        eventId: { in: eventDepts.map((ed) => ed.event.id) },
        task: { departmentId },
      },
      include: {
        task: { select: { id: true, name: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const { tasks, memberTasks } = taskStats(taskAssignments, memberStats);

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
