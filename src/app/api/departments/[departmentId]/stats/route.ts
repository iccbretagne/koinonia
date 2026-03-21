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

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });

    if (!department) {
      throw new ApiError(404, "Département introuvable");
    }

    // Get all events for this department in the time range
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const eventDepts = await prisma.eventDepartment.findMany({
      where: {
        departmentId,
        event: { date: { gte: since } },
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

    return successResponse({
      department,
      totalEvents,
      months,
      members,
      trend,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
