import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { recordPlanningChanges, type PlanningChange } from "@/modules/planning";
import { schema } from "./contract";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId: sourceEventId } = await params;
    const churchId = await resolveChurchId("event", sourceEventId);
    const session = await requireChurchPermission("planning:edit", churchId);
    const body = await request.json();
    const { targetEventId } = schema.parse(body);

    if (sourceEventId === targetEventId) {
      throw new ApiError(400, "L'événement source et cible doivent être différents");
    }

    // Verify target event belongs to the same church
    const targetChurchId = await resolveChurchId("event", targetEventId);
    if (targetChurchId !== churchId) {
      throw new ApiError(403, "L'événement cible n'appartient pas à la même église");
    }

    // Get source event-departments with plannings
    const sourceEDs = await prisma.eventDepartment.findMany({
      where: { eventId: sourceEventId },
      include: {
        plannings: true,
      },
    });

    if (sourceEDs.length === 0) {
      throw new ApiError(404, "Aucun département en service pour l'événement source");
    }

    // Get target event-departments
    const targetEDs = await prisma.eventDepartment.findMany({
      where: { eventId: targetEventId },
    });

    const targetByDept = new Map(targetEDs.map((ed) => [ed.departmentId, ed]));

    let copiedCount = 0;
    const changes: PlanningChange[] = [];

    await prisma.$transaction(async (tx) => {
      for (const sourceED of sourceEDs) {
        const targetED = targetByDept.get(sourceED.departmentId);
        if (!targetED) continue; // Skip if department not linked to target event

        // Situation avant recopie, pour prévenir les STAR dont le service change (spec 060).
        const before = new Map(
          (
            await tx.planning.findMany({
              where: { eventDepartmentId: targetED.id },
              select: { memberId: true, status: true },
            })
          ).map((p) => [p.memberId, p.status])
        );

        for (const planning of sourceED.plannings) {
          if ((before.get(planning.memberId) ?? null) !== planning.status) {
            changes.push({
              memberId: planning.memberId,
              eventId: targetEventId,
              departmentId: sourceED.departmentId,
              previousStatus: before.get(planning.memberId) ?? null,
            });
          }
          await tx.planning.upsert({
            where: {
              eventDepartmentId_memberId: {
                eventDepartmentId: targetED.id,
                memberId: planning.memberId,
              },
            },
            update: { status: planning.status },
            create: {
              eventDepartmentId: targetED.id,
              memberId: planning.memberId,
              status: planning.status,
            },
          });
          copiedCount++;
        }
      }
    });

    try {
      await recordPlanningChanges(prisma, churchId, changes, { actorId: session.user.id });
    } catch (error) {
      console.error("[duplicate-planning] enregistrement des changements à notifier impossible", error);
    }

    return successResponse({
      copied: copiedCount,
      departments: sourceEDs.filter((ed) =>
        targetByDept.has(ed.departmentId)
      ).length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
