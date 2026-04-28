/**
 * GET /api/media/download/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo approuvée.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedDownloadUrl } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);

    const photo = await prisma.mediaPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, filename: true, mediaEventId: true, originalKey: true, status: true },
    });

    if (!photo) throw new ApiError(404, "Photo introuvable");
    if (shareToken.mediaEventId && photo.mediaEventId !== shareToken.mediaEventId) {
      throw new ApiError(403, "Photo hors périmètre");
    }
    if (shareToken.type === "MEDIA" && photo.status !== "APPROVED") {
      throw new ApiError(403, "Photo non approuvée");
    }

    const downloadUrl = await getSignedDownloadUrl(photo.originalKey, photo.filename);

    return successResponse({ id: photo.id, filename: photo.filename, downloadUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
