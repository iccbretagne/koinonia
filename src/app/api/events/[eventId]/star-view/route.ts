import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    await requireChurchPermission("planning:view", churchId);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        church: { select: { name: true } },
        eventDepts: {
          include: {
            department: {
              include: {
                ministry: { select: { name: true } },
              },
            },
            plannings: {
              where: {
                status: {
                  in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
                },
              },
              include: {
                member: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new ApiError(404, "Event not found");
    }

    let totalStars = 0;

    const departments = event.eventDepts.map((ed) => {
      const members = ed.plannings.map((p) => ({
        id: p.member.id,
        firstName: p.member.firstName,
        lastName: p.member.lastName,
        status: p.status,
      }));
      totalStars += members.length;
      return {
        id: ed.department.id,
        name: ed.department.name,
        ministryName: ed.department.ministry.name,
        members,
      };
    });

    return successResponse({
      event: {
        id: event.id,
        title: event.title,
        date: event.date.toISOString(),
        church: { name: event.church.name },
      },
      departments,
      totalStars,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
