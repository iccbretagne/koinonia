import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { planningBus, recordRemovedPlannings } from "@/modules/planning";
import { z } from "zod";

async function verifyDepartmentChurch(departmentId: string, expectedChurchId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { ministry: { select: { churchId: true } } },
  });
  if (!dept) throw new ApiError(404, "Département introuvable");
  if (dept.ministry.churchId !== expectedChurchId) {
    throw new ApiError(403, "Ce département n'appartient pas à l'église de cet événement");
  }
}

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
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("events:manage", churchId);
    const body = await request.json();
    const { departmentId, applyToSeries } = schema.parse(body);
    await verifyDepartmentChurch(departmentId, churchId);

    if (applyToSeries) {
      const eventIds = await getSeriesEventIds(eventId);
      const created = await prisma.$transaction(async (tx) => {
        const links = [];
        for (const eid of eventIds) {
          const existed = await tx.eventDepartment.findUnique({
            where: { eventId_departmentId: { eventId: eid, departmentId } },
            select: { id: true },
          });
          links.push(
            await tx.eventDepartment.upsert({
              where: { eventId_departmentId: { eventId: eid, departmentId } },
              update: {},
              create: { eventId: eid, departmentId },
            })
          );
          if (!existed) {
            await planningBus.emit(
              "planning:event:departments:added",
              { tx, churchId, userId: session.user.id },
              { eventId: eid, churchId, departmentIds: [departmentId] }
            );
          }
        }
        return links;
      });
      return successResponse({ created: created.length }, 201);
    }

    const eventDept = await prisma.$transaction(async (tx) => {
      const created = await tx.eventDepartment.create({
        data: { eventId, departmentId },
        include: { department: { select: { id: true, name: true } } },
      });
      await planningBus.emit(
        "planning:event:departments:added",
        { tx, churchId, userId: session.user.id },
        { eventId, churchId, departmentIds: [departmentId] }
      );
      return created;
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
    const { eventId } = await params;
    const delChurchId = await resolveChurchId("event", eventId);
    const delSession = await requireChurchPermission("events:manage", delChurchId);
    const body = await request.json();
    const { departmentId, applyToSeries } = schema.parse(body);
    await verifyDepartmentChurch(departmentId, delChurchId);

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
        await recordRemovedPlannings(tx, delChurchId, edIds, { actorId: delSession.user.id });
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

    await prisma.$transaction(async (tx) => {
      const ed = await tx.eventDepartment.findUnique({
        where: { eventId_departmentId: { eventId, departmentId } },
        select: { id: true },
      });
      if (ed) {
        await recordRemovedPlannings(tx, delChurchId, [ed.id], { actorId: delSession.user.id });
        await tx.planning.deleteMany({ where: { eventDepartmentId: ed.id } });
      }
      await tx.eventDepartment.delete({
        where: { eventId_departmentId: { eventId, departmentId } },
      });
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
