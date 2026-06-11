import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

    // Already-assigned families for this event (to exclude from suggestions)
    const assignedIds = eventId
      ? (await prisma.welcomeDutyAssignment.findMany({
          where: { eventId, churchId },
          select: { welcomeDutyFamilyId: true },
        })).map((a) => a.welcomeDutyFamilyId)
      : [];

    // All active pool families with their last service date
    const families = await prisma.welcomeDutyFamily.findMany({
      where: {
        churchId,
        active: true,
        ...(assignedIds.length ? { id: { notIn: assignedIds } } : {}),
      },
      include: {
        assignments: {
          include: { event: { select: { date: true } } },
          orderBy: { event: { date: "desc" } },
          take: 1,
        },
      },
    });

    // Sort: never served first, then by oldest last service date
    const sorted = families
      .map((f) => ({
        id:            f.id,
        familyId:      f.familyId,
        familyName:    f.familyName,
        lastServedAt:  f.assignments[0]?.event.date ?? null,
      }))
      .sort((a, b) => {
        if (!a.lastServedAt && !b.lastServedAt) return a.familyName.localeCompare(b.familyName);
        if (!a.lastServedAt) return -1;
        if (!b.lastServedAt) return 1;
        return a.lastServedAt.getTime() - b.lastServedAt.getTime();
      })
      .slice(0, limit);

    return successResponse(sorted);
  } catch (error) {
    return errorResponse(error);
  }
}
