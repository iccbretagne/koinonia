import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requirePermission("events:view");
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    const events = await prisma.event.findMany({
      where: churchId ? { churchId } : undefined,
      include: {
        church: { select: { id: true, name: true } },
        eventDepts: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
      orderBy: { date: "desc" },
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
    await requirePermission("events:manage");
    const body = await request.json();
    const { ids, action, data } = bulkSchema.parse(body);

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
        await tx.event.deleteMany({ where: { id: { in: ids } } });
      });
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

    return successResponse({ updated: ids.length });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis"),
  type: z.string().min(1, "Le type est requis"),
  date: z.string().min(1, "La date est requise"),
  churchId: z.string().min(1, "L'église est requise"),
  planningDeadline: z.string().nullable().optional(),
  recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).nullable().optional(),
  recurrenceEnd: z.string().nullable().optional(),
});

function generateRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  // Skip the first date (it's the parent)
  while (true) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;

    if (current > endDate) break;
    dates.push(new Date(current));
  }

  return dates;
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const body = await request.json();
    const data = createSchema.parse(body);

    const deadline = data.planningDeadline
      ? new Date(data.planningDeadline)
      : null;

    // If recurrence is set, create parent + children in a transaction
    if (data.recurrenceRule && data.recurrenceEnd) {
      const startDate = new Date(data.date);
      const endDate = new Date(data.recurrenceEnd);
      const childDates = generateRecurrenceDates(
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
          await tx.event.create({
            data: {
              title: data.title,
              type: data.type,
              date: childDate,
              churchId: data.churchId,
              planningDeadline: deadline,
              recurrenceRule: data.recurrenceRule,
              seriesId: parent.id,
            },
          });
        }

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
        { ...result, childrenCreated: childDates.length },
        201
      );
    }

    // Single event creation
    const event = await prisma.event.create({
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
