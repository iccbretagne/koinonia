/**
 * GET    /api/media/validate/[token]/file/[fileId]  — URL signée de la version courante
 * PATCH  /api/media/validate/[token]/file/[fileId]  — validation/rejet/révision via token public
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedOriginalUrl } from "@/modules/media";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED", "REVISION_REQUESTED"]),
  comment: z.string().max(2000).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    const { token, fileId } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);

    if (!shareToken.mediaProjectId) throw new ApiError(403, "Token non associé à un projet");

    const version = await prisma.mediaFileVersion.findFirst({
      where: { mediaFile: { id: fileId, mediaProjectId: shareToken.mediaProjectId } },
      orderBy: { versionNumber: "desc" },
      select: { originalKey: true, mediaFile: { select: { filename: true } } },
    });

    if (!version) throw new ApiError(404, "Fichier introuvable");

    const originalUrl = await getSignedOriginalUrl(version.originalKey);
    return successResponse({ id: fileId, originalUrl, filename: version.mediaFile.filename });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    const { token, fileId } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);

    if (!shareToken.mediaProjectId) throw new ApiError(403, "Token non associé à un projet");

    const body = await request.json();
    const { status, comment } = patchSchema.parse(body);

    const prevalidatorStatuses = ["PREVALIDATED", "PREREJECTED", "REVISION_REQUESTED"];
    const validatorStatuses    = ["APPROVED", "REJECTED", "REVISION_REQUESTED"];

    if (shareToken.type === "PREVALIDATOR" && !prevalidatorStatuses.includes(status)) {
      throw new ApiError(403, "Action non autorisée pour un prévalidateur");
    }
    if (shareToken.type === "VALIDATOR" && !validatorStatuses.includes(status)) {
      throw new ApiError(403, "Action non autorisée pour un validateur");
    }

    const file = await prisma.mediaFile.findUnique({
      where: { id: fileId },
      select: { id: true, mediaProjectId: true },
    });

    if (!file) throw new ApiError(404, "Fichier introuvable");
    if (file.mediaProjectId !== shareToken.mediaProjectId) throw new ApiError(403, "Fichier hors périmètre");

    const updated = await prisma.mediaFile.update({
      where: { id: fileId },
      data: { status },
    });

    if (comment?.trim()) {
      await prisma.mediaComment.create({
        data: {
          mediaFileId: fileId,
          content: comment.trim(),
          authorName: shareToken.label ?? (shareToken.type === "PREVALIDATOR" ? "Prévalidateur" : "Validateur"),
          type: "GENERAL",
        },
      });
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
