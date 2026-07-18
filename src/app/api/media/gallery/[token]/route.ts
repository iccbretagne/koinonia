/**
 * GET /api/media/gallery/[token]
 * Retourne la galerie (token GALLERY) : photos d'un événement ou fichiers d'un projet.
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, resolveGalleryData } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "GALLERY");
    return successResponse(await resolveGalleryData(shareToken));
  } catch (error) {
    return errorResponse(error);
  }
}
