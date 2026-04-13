import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { planningBus } from "@/modules/planning";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("events:view", churchId);

    const trackedOnly = searchParams.get("trackedForDiscipleship") === "true";
    const from = searchParams.get("from");

    const events = await prisma.event.findMany({
      where: {
        churchId,
        ...(trackedOnly ? { trackedForDiscipleship: true } : {}),
        ...(from ? { date: { gte: new Date(from) } } : {}),
      },
      include: {
        church: { select: { id: true, name: true } },
        eventDepts: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
      orderBy: { date: trackedOnly ? "asc" : "desc" },
    });

    return successResponse(events);
  } catch (error) {
    return errorResponse(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Au moins un ID requis"),
  action: z.enum(["delete", "update"]),
  data: z.object({
    title: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    date: z.string().min(1).optional(),
  }).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

    if (ids.length === 0) throw new ApiError(400, "Au moins un ID requis");
    const { resolveChurchId } = await import("@/lib/auth");
    const evtChurchId = await resolveChurchId("event", ids[0]);

    // Verify ALL ids belong to the same church
    if (ids.length > 1) {
      const allChurchIds = await Promise.all(ids.map((id) => resolveChurchId("event", id)));
      if (allChurchIds.some((cid) => cid !== evtChurchId)) {
        throw new ApiError(400, "Tous les événements doivent appartenir à la même église");
      }
    }

    const patchSession = await requireChurchPermission("events:manage", evtChurchId);

    if (action === "delete") {
      await prisma.$transaction(async (tx) => {
        const eventDeptIds = (
          await tx.eventDepartment.findMany({
            where: { eventId: { in: ids } },
            select: { id: true },
          })
        ).map((ed) => ed.id);
        await tx.planning.deleteMany({ where: { eventDepartmentId: { in: eventDeptIds } } });
        await tx.eventDepartment.deleteMany({ where: { eventId: { in: ids } } });
        await tx.discipleshipAttendance.deleteMany({ where: { eventId: { in: ids } } });
        await tx.eventReport.deleteMany({ where: { eventId: { in: ids } } });
        await tx.taskAssignment.deleteMany({ where: { eventId: { in: ids } } });
        await tx.announcementEvent.deleteMany({ where: { eventId: { in: ids } } });
        await tx.event.deleteMany({ where: { id: { in: ids } } });
      });
      for (const id of ids) {
        await logAudit({ userId: patchSession.user.id, churchId: evtChurchId, action: "DELETE", entityType: "Event", entityId: id });
      }
      return successResponse({ deleted: ids.length });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.date) {
      updateData.date = new Date(data.date);
    }

    await prisma.event.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    for (const id of ids) {
      await logAudit({ userId: patchSession.user.id, churchId: evtChurchId, action: "UPDATE", entityType: "Event", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

function isValidDate(val: string) {
  return !isNaN(new Date(val).getTime());
}

const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis"),
  type: z.string().min(1, "Le type est requis"),
  date: z.string().min(1, "La date est requise").refine(isValidDate, "Date invalide"),
  churchId: z.string().min(1, "L'église est requise"),
  planningDeadline: z.string().nullable().optional().refine(
    (v) => v == null || isValidDate(v),
    "Date limite invalide"
  ),
  deadlineOffset: z.string().nullable().optional(),
  recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).nullable().optional(),
  recurrenceEnd: z.string().nullable().optional().refine(
    (v) => v == null || isValidDate(v),
    "Date de fin de récurrence invalide"
  ),
});

function computeDeadlineFromOffset(eventDate: Date, offset: string): Date {
  const result = new Date(eventDate);
  const match = offset.match(/^(\d+)(h|d)$/);
  if (!match) return result;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === "h") {
    result.setHours(result.getHours() - value);
  } else if (unit === "d") {
    result.setDate(result.getDate() - value);
  }

  return result;
}

const MAX_RECURRENCE_OCCURRENCES = 104; // ~2 ans hebdomadaires

function generateRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): { dates: Date[]; truncated: boolean } {
  if (isNaN(endDate.getTime())) return { dates: [], truncated: false };
  const dates: Date[] = [];
  const current = new Date(startDate);

  // Skip the first date (it's the parent)
  while (dates.length < MAX_RECURRENCE_OCCURRENCES) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;

    if (current > endDate) break;
    dates.push(new Date(current));
  }

  const truncated = dates.length === MAX_RECURRENCE_OCCURRENCES && current <= endDate;
  return { dates, truncated };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const session = await requireChurchPermission("events:manage", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const useOffset = data.deadlineOffset && !data.planningDeadline;
    const deadline = useOffset
      ? computeDeadlineFromOffset(new Date(data.date), data.deadlineOffset!)
      : data.planningDeadline
        ? new Date(data.planningDeadline)
        : null;

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
        details: { recurrence: data.recurrenceRule, children: childDates.length },
      });

      return successResponse(
        {
          ...result,
          childrenCreated: childDates.length,
          ...(recurrenceTruncated ? { recurrenceTruncated: true, maxOccurrences: MAX_RECURRENCE_OCCURRENCES } : {}),
        },
        201
      );
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
      details: { title: data.title },
    });

    return successResponse(event, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
