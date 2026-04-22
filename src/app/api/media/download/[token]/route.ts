/**
 * GET /api/media/download/[token]
 * Retourne les photos approuvées accessibles au téléchargement (token MEDIA).
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, "MEDIA");
    const event = shareToken.mediaEvent;

    if (!event) return successResponse({ token: shareToken, photos: [] });

    const photos = await prisma.mediaPhoto.findMany({
      where: { mediaEventId: event.id, status: "APPROVED" },
      orderBy: { uploadedAt: "asc" },
    });

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        filename: p.filename,
        size: p.size,
        width: p.width,
        height: p.height,
        thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
      }))
    );

    return successResponse({
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label },
      event: { id: event.id, name: event.name, date: event.date, photoCount: photosWithUrls.length },
      photos: photosWithUrls,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
