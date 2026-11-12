import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { recordRemovedPlannings } from "@/modules/planning";
import { schema } from "./contract";
import { addEventDepartment, getSeriesEventIds, verifyDepartmentChurch } from "./_core";

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
    const result = await addEventDepartment(session, churchId, eventId, departmentId, applyToSeries);
    return successResponse(result, 201);
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
