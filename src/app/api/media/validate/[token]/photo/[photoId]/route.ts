/**
 * GET    /api/media/validate/[token]/photo/[photoId]  — URL HD signée
 * PATCH  /api/media/validate/[token]/photo/[photoId]  — validation/rejet
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedOriginalUrl } from "@/modules/media";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);

    const photo = await prisma.mediaPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, originalKey: true, filename: true, mediaEventId: true },
    });

    if (!photo) throw new ApiError(404, "Photo introuvable");
    if (shareToken.mediaEventId && photo.mediaEventId !== shareToken.mediaEventId) {
      throw new ApiError(403, "Photo hors périmètre");
    }

    const originalUrl = await getSignedOriginalUrl(photo.originalKey);
    return successResponse({ id: photo.id, originalUrl, filename: photo.filename });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);

    const body = await request.json();
    const { status } = patchSchema.parse(body);

    // Prevalidator can only set PREVALIDATED/PREREJECTED
    if (shareToken.type === "PREVALIDATOR" && !["PREVALIDATED", "PREREJECTED"].includes(status)) {
      throw new ApiError(403, "Le prévalidateur ne peut que prévalider ou écarter");
    }

    // Validator can only set APPROVED/REJECTED
    if (shareToken.type === "VALIDATOR" && !["APPROVED", "REJECTED"].includes(status)) {
      throw new ApiError(403, "Le validateur ne peut qu'approuver ou rejeter");
    }

    const photo = await prisma.mediaPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, mediaEventId: true },
    });

    if (!photo) throw new ApiError(404, "Photo introuvable");
    if (shareToken.mediaEventId && photo.mediaEventId !== shareToken.mediaEventId) {
      throw new ApiError(403, "Photo hors périmètre");
    }

    const updated = await prisma.mediaPhoto.update({
      where: { id: photoId },
      data: { status, validatedAt: new Date() },
    });

    // Auto-transition de l'événement → REVIEWED si plus aucune photo en attente
    if (shareToken.type === "VALIDATOR" && shareToken.mediaEventId) {
      const pendingCount = await prisma.mediaPhoto.count({
        where: {
          mediaEventId: shareToken.mediaEventId,
          status: { in: ["PENDING", "PREVALIDATED"] },
        },
      });
      if (pendingCount === 0) {
        await prisma.mediaEvent.updateMany({
          where: {
            id: shareToken.mediaEventId,
            status: { in: ["PENDING_REVIEW", "DRAFT"] },
          },
          data: { status: "REVIEWED" },
        });
      }
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
