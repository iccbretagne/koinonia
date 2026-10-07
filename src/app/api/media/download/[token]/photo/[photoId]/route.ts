/**
 * GET /api/media/download/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo approuvée.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedDownloadUrl } from "@/modules/media";

async function projectFileLink(mediaProjectId: string, fileId: string, approvedOnly: boolean) {
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
  if (file.mediaProjectId !== mediaProjectId) {
    throw new ApiError(403, "Fichier hors périmètre");
  }
  if (approvedOnly && !["APPROVED", "FINAL_APPROVED"].includes(file.status)) {
    throw new ApiError(403, "Fichier non validé");
  }
  if (file.status === "DRAFT") throw new ApiError(403, "Fichier non validé");

  const originalKey = file.versions[0]?.originalKey;
  if (!originalKey) throw new ApiError(404, "Fichier S3 introuvable");

  const downloadUrl = await getSignedDownloadUrl(originalKey, file.filename);
  return { id: file.id, filename: file.filename, downloadUrl };
}

async function eventPhotoLink(mediaEventId: string, photoId: string, approvedOnly: boolean) {
  const photo = await prisma.mediaPhoto.findFirst({
    where: { id: photoId, mediaEventId },
    select: { id: true, filename: true, originalKey: true, status: true },
  });

  if (!photo) throw new ApiError(404, "Photo introuvable");
  if (approvedOnly && photo.status !== "APPROVED") {
    throw new ApiError(403, "Photo non approuvée");
  }

  const downloadUrl = await getSignedDownloadUrl(photo.originalKey, photo.filename);
  return { id: photo.id, filename: photo.filename, downloadUrl };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);

    // Lien « MEDIA » : uniquement les fichiers et photos validés ; « MEDIA_ALL » : tout sauf brouillon.
    const approvedOnly = shareToken.type === "MEDIA";

    // ── Projet : le "photoId" désigne un fichier du projet ──────────────────────
    if (shareToken.mediaProjectId) {
      return successResponse(await projectFileLink(shareToken.mediaProjectId, photoId, approvedOnly));
    }

    // ── Événement : photo ───────────────────────────────────────────────────────
    // Une photo n'appartient jamais à un projet : un jeton sans événement (ou délégué à un
    // projet, déjà traité ci-dessus) n'a rien de légitime à faire ici — refus inconditionnel
    // (spec 025).
    if (!shareToken.mediaEventId) throw new ApiError(404, "Photo introuvable");
    return successResponse(await eventPhotoLink(shareToken.mediaEventId, photoId, approvedOnly));
  } catch (error) {
    return errorResponse(error);
  }
}
