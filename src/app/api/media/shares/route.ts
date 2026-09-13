/**
 * GET /api/media/shares
 * Liste les partages actifs de l'église courante, filtrés au périmètre de l'appelant (spec 049).
 */
import { requireAuth, getCurrentChurchId, requireMediaCollectionAccess, getMediaShareScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listActiveShares } from "@/modules/media";

export async function GET() {
  try {
    const authSession = await requireAuth();
    const churchId = await getCurrentChurchId(authSession);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const session = await requireMediaCollectionAccess(churchId);
    const scope = await getMediaShareScope(session, churchId);

    const shares = await listActiveShares(churchId, scope);
    return successResponse({ data: shares });
  } catch (error) {
    return errorResponse(error);
  }
}
