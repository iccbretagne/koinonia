/**
 * GET /api/media/collection/[token]/file/[fileId]
 * Retourne une URL signée pour télécharger un visuel de la collection.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedDownloadUrl } from "@/modules/media";
import type { CollectionConfig } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> }
) {
  try {
    const { token, fileId } = await params;
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    const config = shareToken.config as CollectionConfig | null;
    if (!config) throw new ApiError(400, "Configuration manquante");

    const file = await prisma.mediaFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filename: true,
        mediaProjectId: true,
        status: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { originalKey: true },
        },
      },
    });

    if (!file) throw new ApiError(404, "Fichier introuvable");
    if (!file.mediaProjectId || !config.projectIds.includes(file.mediaProjectId)) {
      throw new ApiError(403, "Fichier hors périmètre");
    }
    if (!["APPROVED", "FINAL_APPROVED"].includes(file.status)) {
      throw new ApiError(403, "Fichier non approuvé");
    }

    const originalKey = file.versions[0]?.originalKey;
    if (!originalKey) throw new ApiError(404, "Fichier S3 introuvable");

    const downloadUrl = await getSignedDownloadUrl(originalKey, file.filename);
    return successResponse({ id: file.id, filename: file.filename, downloadUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
