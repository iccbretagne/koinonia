import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import {
  planningBus,
  deleteEvents,
  collectEventChangeNotices,
  sendEventChangeNotices,
  emptyEventChangeNotices,
} from "@/modules/planning";
import { bulkSchema, createSchema } from "./contract";
import { createEvent } from "./_core";

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
      const notices = await prisma.$transaction((tx) =>
        deleteEvents({ tx, churchId: evtChurchId, userId: patchSession.user.id }, ids)
      );
      const { notified } = await sendEventChangeNotices(notices);
      for (const id of ids) {
        await logAudit({ userId: patchSession.user.id, churchId: evtChurchId, action: "DELETE", entityType: "Event", entityId: id });
      }
      return successResponse({ deleted: ids.length, notified });
    }

    if (!data || Object.keys(data).length === 0) {
      return errorResponse(new Error("Aucune donnée à mettre à jour"));
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.date) {
      updateData.date = new Date(data.date);
    }

    const notices = await prisma.$transaction(async (tx) => {
      const before = data.date
        ? await tx.event.findMany({ where: { id: { in: ids } }, select: { id: true, date: true } })
        : [];
      await tx.event.updateMany({
        where: { id: { in: ids } },
        data: updateData,
      });
      for (const ev of before) {
        await planningBus.emit(
          "planning:event:rescheduled",
          { tx, churchId: evtChurchId, userId: patchSession.user.id },
          {
            eventId: ev.id,
            churchId: evtChurchId,
            previousDate: ev.date.toISOString(),
            newDate: (updateData.date as Date).toISOString(),
          }
        );
      }
      if (before.length === 0) return emptyEventChangeNotices();
      return collectEventChangeNotices(
        tx,
        evtChurchId,
        before.map((ev) => ({ kind: "MOVED" as const, eventId: ev.id, previousDate: ev.date, newDate: updateData.date as Date })),
        { actorId: patchSession.user.id }
      );
    });
    const { notified } = await sendEventChangeNotices(notices);

    for (const id of ids) {
      await logAudit({ userId: patchSession.user.id, churchId: evtChurchId, action: "UPDATE", entityType: "Event", entityId: id, details: data });
    }
    return successResponse({ updated: ids.length, notified });
  } catch (error) {
    return errorResponse(error);
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const session = await requireChurchPermission("events:manage", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const result = await createEvent(session, data);
    return successResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
