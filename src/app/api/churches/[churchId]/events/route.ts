import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ churchId: string }> }
) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("events:view", churchId);

    const url = new URL(request.url);
    const month = url.searchParams.get("month"); // format: YYYY-MM

    const where: { churchId: string; date?: { gte: Date; lt: Date } } = {
      churchId,
    };

    if (month) {
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 1);
      where.date = { gte: start, lt: end };
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        eventDepts: {
          include: { department: true },
        },
      },
    });

    return successResponse(events);
  } catch (error) {
    return errorResponse(error);
  }
}
