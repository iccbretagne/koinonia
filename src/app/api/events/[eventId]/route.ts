import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requireAuth();
    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventDepts: {
          include: {
            department: {
              include: { ministry: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new ApiError(404, "Event not found");
    }

    return successResponse(event);
  } catch (error) {
    return errorResponse(error);
  }
}

const updateSchema = z.object({
  title: z.string().min(1, "Le titre est requis"),
  type: z.string().min(1, "Le type est requis"),
  date: z.string().min(1, "La date est requise"),
  planningDeadline: z.string().nullable().optional(),
  applyToSeries: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requirePermission("events:manage");
    const { eventId } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    if (data.applyToSeries) {
      // Resolve the parent ID of the series
      const current = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, seriesId: true, isRecurrenceParent: true },
      });

      if (!current) {
        throw new ApiError(404, "Événement introuvable");
      }

      const parentId = current.isRecurrenceParent
        ? current.id
        : current.seriesId;

      if (!parentId) {
        throw new ApiError(400, "Cet événement ne fait pas partie d'une série");
      }

      // Fetch all events in the series
      const seriesEvents = await prisma.event.findMany({
        where: { OR: [{ id: parentId }, { seriesId: parentId }] },
        select: { id: true, date: true },
      });

      // Extract time from the submitted date to propagate to all events
      // Use local time methods so DST transitions are handled correctly
      const submittedDate = new Date(data.date);
      const newHours = submittedDate.getHours();
      const newMinutes = submittedDate.getMinutes();

      // Calculate deadline offset relative to the submitted event date
      const submittedDeadline = data.planningDeadline
        ? new Date(data.planningDeadline)
        : null;
      const deadlineOffsetMs = submittedDeadline
        ? submittedDeadline.getTime() - submittedDate.getTime()
        : null;

      // Update each event individually: propagate time + relative deadline
      await prisma.$transaction(
        seriesEvents.map((ev) => {
          const eventDate = new Date(ev.date);
          // Keep the event's own date (day) but apply the new time
          eventDate.setHours(newHours, newMinutes, 0, 0);

          // Calculate this event's deadline relative to its own date
          const eventDeadline =
            deadlineOffsetMs !== null
              ? new Date(eventDate.getTime() + deadlineOffsetMs)
              : null;

          return prisma.event.update({
            where: { id: ev.id },
            data: {
              title: data.title,
              type: data.type,
              date: eventDate,
              planningDeadline: eventDeadline,
            },
          });
        })
      );

      // Re-fetch the current event for UI update
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          church: { select: { id: true, name: true } },
          eventDepts: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });

      return successResponse({ ...event, seriesUpdated: seriesEvents.length });
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        title: data.title,
        type: data.type,
        date: new Date(data.date),
        planningDeadline:
          data.planningDeadline !== undefined
            ? data.planningDeadline
              ? new Date(data.planningDeadline)
              : null
            : undefined,
      },
      include: {
        church: { select: { id: true, name: true } },
        eventDepts: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });

    return successResponse(event);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requirePermission("events:manage");
    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new ApiError(404, "Événement introuvable");
    }

    await prisma.event.delete({ where: { id: eventId } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
