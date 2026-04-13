/**
 * PATCH /api/media/validate/[token]/photo/[photoId]
 * Valide ou rejette une photo individuelle via token de partage.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken } from "@/modules/media";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED"]),
});

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

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
