import { requireChurchPermission, requireDepartmentAccess, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getWithdrawalOwner, replaceWithdrawal } from "@/modules/planning";
import { replaceSchema } from "./contract";

/** Choix d'un remplaçant (spec 061) : `planning:edit` dans le périmètre du département. */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("serviceWithdrawal", id);
    const session = await requireChurchPermission("planning:edit", churchId);

    const owner = await getWithdrawalOwner(id);
    if (!owner) throw new ApiError(404, "Désistement introuvable");
    requireDepartmentAccess(session, churchId, owner.departmentId);

    const { memberId } = replaceSchema.parse(await request.json());
    const withdrawal = await replaceWithdrawal({ withdrawalId: id, memberId, actorId: session.user.id });
    return successResponse({ withdrawal });
  } catch (error) {
    return errorResponse(error);
  }
}
