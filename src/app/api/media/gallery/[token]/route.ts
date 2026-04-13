/**
 * GET /api/media/gallery/[token]
 * Retourne la galerie photos (photos approuvées) via token GALLERY.
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
    const shareToken = await validateMediaShareToken(token, "GALLERY");

    const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;
    const event = shareToken.mediaEvent;

    if (!event) return successResponse({ token: shareToken, photos: [] });

    const photos = await prisma.mediaPhoto.findMany({
      where: {
        mediaEventId: event.id,
        ...(onlyApproved ? { status: "APPROVED" } : {}),
      },
      orderBy: { uploadedAt: "asc" },
    });

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        filename: p.filename,
        status: p.status,
        width: p.width,
        height: p.height,
        thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
      }))
    );

    return successResponse({
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label, config: shareToken.config },
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        photoCount: photosWithUrls.length,
      },
      photos: photosWithUrls,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
