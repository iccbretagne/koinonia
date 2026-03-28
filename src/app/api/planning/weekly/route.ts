import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const weekStart = searchParams.get("weekStart"); // YYYY-MM-DD (Monday)

    if (!churchId) throw new ApiError(400, "churchId requis");
    if (!weekStart) throw new ApiError(400, "weekStart requis");

    await requireChurchPermission("planning:view", churchId);

    const from = new Date(weekStart);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);

    const events = await prisma.event.findMany({
      where: {
        churchId,
        date: { gte: from, lt: to },
      },
      orderBy: { date: "asc" },
      include: {
        eventDepts: {
          include: {
            department: { select: { id: true, name: true } },
          },
          orderBy: { department: { name: "asc" } },
        },
        departmentNotices: {
          select: {
            departmentId: true,
            content: true,
            updatedAt: true,
            author: { select: { name: true, displayName: true } },
          },
        },
      },
    });

    const data = events.map((event) => {
      const noticeByDept = new Map(
        event.departmentNotices.map((n) => [
          n.departmentId,
          {
            content: n.content,
            updatedAt: n.updatedAt.toISOString(),
            authorName: n.author.displayName ?? n.author.name ?? null,
          },
        ])
      );

      return {
        id: event.id,
        title: event.title,
        type: event.type,
        date: event.date.toISOString(),
        departments: event.eventDepts.map((ed) => ({
          id: ed.department.id,
          name: ed.department.name,
          notice: noticeByDept.get(ed.department.id) ?? null,
        })),
      };
    });

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
