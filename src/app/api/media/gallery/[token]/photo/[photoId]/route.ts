/**
 * GET /api/media/gallery/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo depuis la galerie.
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedOriginalUrl } from "@/modules/media";
import { resolvePhotoLink } from "../../../../_photo-link";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, "GALLERY");

    return successResponse(
      await resolvePhotoLink(shareToken, photoId, {
        approvedOnly: (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false,
        signUrl: (key) => getSignedOriginalUrl(key),
        messages: {
          fileNotAvailable: "Ce fichier n'est pas disponible",
          fileNotApproved: "Ce fichier n'est pas validé",
          photoNotApproved: "Cette photo n'est pas approuvée",
        },
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
