import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { resolveOwnMemberForDepartment, withdrawService } from "@/modules/planning";
import { withdrawSchema } from "./contract";

/**
 * « Je ne peux plus » (spec 061) : un STAR se désiste d'un service où il est planifié. L'église
 * qui fait autorité est celle de l'événement ; la fiche doit être liée au compte appelant.
 */

export async function POST(request: Request) {
  try {
    const { eventId, departmentId, message } = withdrawSchema.parse(await request.json());
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);
    const memberId = await resolveOwnMemberForDepartment(session.user.id, churchId, departmentId);

    const withdrawal = await withdrawService({
      churchId,
      eventId,
      departmentId,
      memberId,
      actorId: session.user.id,
      message: message ?? null,
    });
    return successResponse({ withdrawal }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
