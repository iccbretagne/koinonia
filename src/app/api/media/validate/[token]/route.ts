/**
 * GET /api/media/validate/[token]
 * Retourne l'événement média et ses photos pour validation/prévalidation.
 * Accessible sans authentification via un token de partage VALIDATOR ou PREVALIDATOR.
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedThumbnailUrl } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);

    const isPrevalidator = shareToken.type === "PREVALIDATOR";
    const event = shareToken.mediaEvent;

    if (!event) {
      return successResponse({ token: shareToken, event: null });
    }

    const hasPrevalidator = event.shareTokens.some((t) => t.type === "PREVALIDATOR");

    // Filtre statuts selon le type de token
    let statusFilter: string[];
    if (isPrevalidator) {
      statusFilter = ["PENDING"];
    } else if (hasPrevalidator) {
      statusFilter = ["PREVALIDATED", "APPROVED", "REJECTED"];
    } else {
      statusFilter = ["PENDING", "PREVALIDATED", "APPROVED", "REJECTED"];
    }

    const { prisma } = await import("@/lib/prisma");
    const photos = await prisma.mediaPhoto.findMany({
      where: {
        mediaEventId: event.id,
        status: { in: statusFilter as ("PENDING" | "APPROVED" | "REJECTED" | "PREVALIDATED" | "PREREJECTED")[] },
      },
      orderBy: { uploadedAt: "asc" },
    });

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        thumbnailUrl: await getSignedThumbnailUrl(p.thumbnailKey),
      }))
    );

    return successResponse({
      token: { id: shareToken.id, type: shareToken.type, label: shareToken.label },
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        status: event.status,
        isPrevalidator,
        hasPrevalidator,
        totalPhotos: event.photos.length,
        approvedCount: event.photos.filter((p) => p.status === "APPROVED").length,
        pendingCount: event.photos.filter((p) => p.status === "PENDING").length,
        rejectedCount: event.photos.filter((p) => p.status === "REJECTED").length,
        prevalidatedCount: event.photos.filter((p) => p.status === "PREVALIDATED").length,
        prerejectedCount: event.photos.filter((p) => p.status === "PREREJECTED").length,
      },
      photos: photosWithUrls,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
