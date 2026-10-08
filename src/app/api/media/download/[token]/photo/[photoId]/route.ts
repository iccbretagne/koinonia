/**
 * GET /api/media/download/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo approuvée.
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedDownloadUrl } from "@/modules/media";
import { resolvePhotoLink } from "../../../../_photo-link";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);

    return successResponse(
      await resolvePhotoLink(shareToken, photoId, {
        // Lien « MEDIA » : uniquement les fichiers et photos validés ; « MEDIA_ALL » : tout sauf brouillon.
        approvedOnly: shareToken.type === "MEDIA",
        signUrl: getSignedDownloadUrl,
        messages: {
          fileNotAvailable: "Fichier non validé",
          fileNotApproved: "Fichier non validé",
          photoNotApproved: "Photo non approuvée",
        },
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
