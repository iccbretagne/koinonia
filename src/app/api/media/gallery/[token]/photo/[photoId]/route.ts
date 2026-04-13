/**
 * GET /api/media/gallery/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo depuis la galerie.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedOriginalUrl } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, "GALLERY");

    const photo = await prisma.mediaPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, filename: true, mediaEventId: true, originalKey: true, status: true },
    });

    if (!photo) throw new ApiError(404, "Photo introuvable");
    if (shareToken.mediaEventId && photo.mediaEventId !== shareToken.mediaEventId) {
      throw new ApiError(403, "Photo hors périmètre");
    }

    const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;
    if (onlyApproved && photo.status !== "APPROVED") {
      throw new ApiError(403, "Cette photo n'est pas approuvée");
    }

    const downloadUrl = await getSignedOriginalUrl(photo.originalKey);

    return successResponse({ id: photo.id, filename: photo.filename, downloadUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
