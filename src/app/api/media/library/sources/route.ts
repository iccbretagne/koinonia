/**
 * GET /api/media/library/sources — sources du filtre de la galerie (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listLibrarySources } from "@/modules/media";
import { sourcesQuerySchema } from "./contract";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireMediaGalleryAccess(churchId);

    const { q } = sourcesQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await listLibrarySources(churchId, q || undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
