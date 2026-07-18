/**
 * GET /api/media/collection/[token]
 * Retourne les contenus d'une collection multi-sources (token COLLECTION).
 */
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, resolveCollectionData } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    const data = await resolveCollectionData(shareToken);
    if (!data) throw new ApiError(400, "Configuration de collection manquante");

    return successResponse({
      ...data,
      totalPhotos: data.photoGroups.reduce((n, g) => n + g.photos.length, 0),
      totalFiles: data.fileGroups.reduce((n, g) => n + g.files.length, 0),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
