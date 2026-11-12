import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { planningBus } from "@/modules/planning";

export async function verifyDepartmentChurch(departmentId: string, expectedChurchId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { ministry: { select: { churchId: true } } },
  });
  if (!dept) throw new ApiError(404, "Département introuvable");
  if (dept.ministry.churchId !== expectedChurchId) {
    throw new ApiError(403, "Ce département n'appartient pas à l'église de cet événement");
  }
}

export async function getSeriesEventIds(eventId: string): Promise<string[]> {
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

/**
 * Rattache un département à un événement, ou à la suite de sa série (même code pour l'écran et
 * l'assistant IA — spec 081, lot 3c). L'appelant a déjà vérifié `events:manage` dans l'église.
 */
export async function addEventDepartment(session: Session, churchId: string, eventId: string, departmentId: string, applyToSeries?: boolean) {
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
    return { created: created.length };
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

  return eventDept;
}
