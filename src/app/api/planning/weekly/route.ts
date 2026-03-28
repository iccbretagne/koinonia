import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const weekStart = searchParams.get("weekStart"); // YYYY-MM-DD (Monday)
    const departmentId = searchParams.get("departmentId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    if (!weekStart) throw new ApiError(400, "weekStart requis");
    if (!departmentId) throw new ApiError(400, "departmentId requis");

    await requireChurchPermission("planning:view", churchId);

    const from = new Date(weekStart);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);

    // Only events that have this department assigned
    const events = await prisma.event.findMany({
      where: {
        churchId,
        date: { gte: from, lt: to },
        eventDepts: { some: { departmentId } },
      },
      orderBy: { date: "asc" },
      include: {
        eventDepts: {
          where: { departmentId },
          include: {
            plannings: {
              where: { status: { not: null } },
              include: {
                member: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        departmentNotices: {
          where: { departmentId },
          select: {
            content: true,
            updatedAt: true,
            author: { select: { name: true, displayName: true } },
          },
        },
      },
    });

    const data = events.map((event) => {
      const eventDept = event.eventDepts[0]; // filtered to this dept only
      const notice = event.departmentNotices[0] ?? null;

      return {
        id: event.id,
        title: event.title,
        type: event.type,
        date: event.date.toISOString(),
        planningDeadline: event.planningDeadline?.toISOString() ?? null,
        notice: notice
          ? {
              content: notice.content,
              updatedAt: notice.updatedAt.toISOString(),
              authorName: notice.author.displayName ?? notice.author.name ?? null,
            }
          : null,
        members: eventDept
          ? eventDept.plannings.map((p) => ({
              id: p.member.id,
              firstName: p.member.firstName,
              lastName: p.member.lastName,
              status: p.status,
            }))
          : [],
      };
    });

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
