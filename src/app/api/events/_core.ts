import type { Session } from "next-auth";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { planningBus } from "@/modules/planning";
import { generateRecurrenceDates, MAX_RECURRENCE_OCCURRENCES } from "@/lib/recurrence";
import type { createSchema } from "./contract";

export type EventInput = z.infer<typeof createSchema>;

export function computeDeadlineFromOffset(eventDate: Date, offset: string): Date {
  const result = new Date(eventDate);
  const match = /^(\d+)([hd])$/.exec(offset);
  if (!match) return result;

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  if (unit === "h") {
    result.setHours(result.getHours() - value);
  } else if (unit === "d") {
    result.setDate(result.getDate() - value);
  }

  return result;
}

/**
 * Crée un événement, ou une série récurrente (même code pour l'écran et l'assistant IA — spec
 * 081, lot 3c). L'appelant a déjà vérifié `events:manage` dans l'église (et le débit).
 */
export async function createEvent(session: Session, data: EventInput, details: Record<string, unknown> = {}) {
  const useOffset = data.deadlineOffset && !data.planningDeadline;
  let deadline: Date | null = null;
  if (useOffset) {
    deadline = computeDeadlineFromOffset(new Date(data.date), data.deadlineOffset!);
  } else if (data.planningDeadline) {
    deadline = new Date(data.planningDeadline);
  }

  // If recurrence is set, create parent + children in a transaction
  if (data.recurrenceRule && data.recurrenceEnd) {
    const startDate = new Date(data.date);
    const endDate = new Date(data.recurrenceEnd);
    const { dates: childDates, truncated: recurrenceTruncated } = generateRecurrenceDates(
      startDate,
      data.recurrenceRule,
      endDate
    );

    const result = await prisma.$transaction(async (tx) => {
      // Create parent event
      const parent = await tx.event.create({
        data: {
          title: data.title,
          type: data.type,
          date: startDate,
          churchId: data.churchId,
          planningDeadline: deadline,
          recurrenceRule: data.recurrenceRule,
          isRecurrenceParent: true,
        },
      });

      // Create child events linked by seriesId
      for (const childDate of childDates) {
        const childDeadline = useOffset
          ? computeDeadlineFromOffset(childDate, data.deadlineOffset!)
          : deadline;

        await tx.event.create({
          data: {
            title: data.title,
            type: data.type,
            date: childDate,
            churchId: data.churchId,
            planningDeadline: childDeadline,
            recurrenceRule: data.recurrenceRule,
            seriesId: parent.id,
          },
        });
      }

      await planningBus.emit(
        "planning:event:created",
        { tx, churchId: data.churchId, userId: session.user.id },
        {
          eventId: parent.id,
          churchId: data.churchId,
          title: data.title,
          type: data.type,
          createdById: session.user.id,
          isRecurrenceParent: true,
          childCount: childDates.length,
        }
      );

      // Return parent with includes
      return tx.event.findUnique({
        where: { id: parent.id },
        include: {
          church: { select: { id: true, name: true } },
          eventDepts: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "Event",
      entityId: result!.id,
      details: { recurrence: data.recurrenceRule, children: childDates.length, ...details },
    });

    return {
      ...result,
      childrenCreated: childDates.length,
      ...(recurrenceTruncated ? { recurrenceTruncated: true, maxOccurrences: MAX_RECURRENCE_OCCURRENCES } : {}),
    };
  }

  // Single event creation
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: data.title,
        type: data.type,
        date: new Date(data.date),
        churchId: data.churchId,
        planningDeadline: deadline,
      },
      include: {
        church: { select: { id: true, name: true } },
        eventDepts: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });

    await planningBus.emit(
      "planning:event:created",
      { tx, churchId: data.churchId, userId: session.user.id },
      {
        eventId: created.id,
        churchId: data.churchId,
        title: data.title,
        type: data.type,
        createdById: session.user.id,
        isRecurrenceParent: false,
      }
    );

    return created;
  });

  await logAudit({
    userId: session.user.id,
    churchId: data.churchId,
    action: "CREATE",
    entityType: "Event",
    entityId: event.id,
    details: { title: data.title, ...details },
  });

  return event;
}
