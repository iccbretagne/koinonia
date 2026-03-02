import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  departmentId: z.string().min(1, "Le département est requis"),
  applyToSeries: z.boolean().optional(),
});

async function getSeriesEventIds(eventId: string): Promise<string[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { seriesId: true, isRecurrenceParent: true, date: true },
  });
  if (!event) return [eventId];

  const parentId = event.isRecurrenceParent ? eventId : event.seriesId;
  if (!parentId) return [eventId];

  // Get future events in the series (including this one)
  const seriesEvents = await prisma.event.findMany({
    where: {
      OR: [
        { id: parentId },
        { seriesId: parentId },
      ],
      date: { gte: event.date },
    },
    select: { id: true },
  });

  return seriesEvents.map((e) => e.id);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requirePermission("events:manage");
    const { eventId } = await params;
    const body = await request.json();
    const { departmentId, applyToSeries } = schema.parse(body);

    if (applyToSeries) {
      const eventIds = await getSeriesEventIds(eventId);
      const created = await prisma.$transaction(
        eventIds.map((eid) =>
          prisma.eventDepartment.upsert({
            where: { eventId_departmentId: { eventId: eid, departmentId } },
            update: {},
            create: { eventId: eid, departmentId },
          })
        )
      );
      return successResponse({ created: created.length }, 201);
    }

    const eventDept = await prisma.eventDepartment.create({
      data: { eventId, departmentId },
      include: { department: { select: { id: true, name: true } } },
    });

    return successResponse(eventDept, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requirePermission("events:manage");
    const { eventId } = await params;
    const body = await request.json();
    const { departmentId, applyToSeries } = schema.parse(body);

    if (applyToSeries) {
      const eventIds = await getSeriesEventIds(eventId);
      // Delete planning records first, then event-department links
      await prisma.$transaction(async (tx) => {
        const edIds = (
          await tx.eventDepartment.findMany({
            where: {
              eventId: { in: eventIds },
              departmentId,
            },
            select: { id: true },
          })
        ).map((ed) => ed.id);
        await tx.planning.deleteMany({ where: { eventDepartmentId: { in: edIds } } });
        await tx.eventDepartment.deleteMany({
          where: {
            eventId: { in: eventIds },
            departmentId,
          },
        });
      });
      return successResponse({ success: true });
    }

    await prisma.eventDepartment.delete({
      where: {
        eventId_departmentId: { eventId, departmentId },
      },
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
