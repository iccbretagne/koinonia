import {
  hasChurchPermission,
  requireChurchPermission,
  requireDepartmentAccess,
  resolveChurchId,
} from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { cancelWithdrawal, getWithdrawalDetail, getWithdrawalOwner, isMemberLinkedToUser } from "@/modules/planning";

/**
 * Service à remplacer (spec 061). `GET` : écran du responsable, candidats recalculés à chaque
 * lecture — lecture seule sans `planning:edit` (Secrétaire). `DELETE` : le STAR annule son
 * désistement tant qu'aucun remplaçant n'a été choisi.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("serviceWithdrawal", id);
    const session = await requireChurchPermission("planning:department", churchId);

    const owner = await getWithdrawalOwner(id);
    if (!owner) throw new ApiError(404, "Désistement introuvable");
    requireDepartmentAccess(session, churchId, owner.departmentId);

    const viewerCanEdit = await hasChurchPermission(session, "planning:edit", churchId);
    const detail = await getWithdrawalDetail(id, { viewerCanEdit });
    if (!detail) throw new ApiError(404, "Désistement introuvable");
    return successResponse(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("serviceWithdrawal", id);
    const session = await requireChurchPermission("planning:view", churchId);

    const owner = await getWithdrawalOwner(id);
    if (!owner) throw new ApiError(404, "Désistement introuvable");
    if (!(await isMemberLinkedToUser(owner.memberId, session.user.id, churchId))) {
      throw new ApiError(403, "Ce désistement n'est pas le vôtre");
    }

    const withdrawal = await cancelWithdrawal({ withdrawalId: id, actorId: session.user.id });
    return successResponse({ withdrawal });
  } catch (error) {
    return errorResponse(error);
  }
}
