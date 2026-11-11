/**
 * GET /api/media/library — une page de la galerie médias (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listLibraryItems } from "@/modules/media";
import { libraryQuerySchema } from "./contract";
import { toGalleryFilters } from "./_filters";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireMediaGalleryAccess(churchId);

    const query = libraryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const page = await listLibraryItems(churchId, toGalleryFilters(query), query.cursor, query.limit);
    return successResponse(page);
  } catch (error) {
    return errorResponse(error);
  }
}
