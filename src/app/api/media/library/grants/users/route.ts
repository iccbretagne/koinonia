/**
 * GET /api/media/library/grants/users — recherche de comptes pour un accès nominatif (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryGrantAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { searchChurchUsersForGrant } from "@/modules/media";
import { usersQuerySchema } from "./contract";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireMediaGalleryGrantAccess(churchId);
    const { q } = usersQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await searchChurchUsersForGrant(churchId, q));
  } catch (error) {
    return errorResponse(error);
  }
}
