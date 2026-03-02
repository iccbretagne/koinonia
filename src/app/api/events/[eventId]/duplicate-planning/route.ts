import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  targetEventId: z.string().min(1, "L'événement cible est requis"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    await requirePermission("planning:edit");
    const { eventId: sourceEventId } = await params;
    const body = await request.json();
    const { targetEventId } = schema.parse(body);

    if (sourceEventId === targetEventId) {
      throw new ApiError(400, "L'événement source et cible doivent être différents");
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

    await prisma.$transaction(async (tx) => {
      for (const sourceED of sourceEDs) {
        const targetED = targetByDept.get(sourceED.departmentId);
        if (!targetED) continue; // Skip if department not linked to target event

        for (const planning of sourceED.plannings) {
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
