/**
 * GET /api/media/gallery/[token]/photo/[photoId]
 * Retourne une URL signée pour télécharger une photo depuis la galerie.
 */
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateMediaShareToken, getSignedOriginalUrl } from "@/modules/media";

async function projectFileLink(mediaProjectId: string, fileId: string, onlyApproved: boolean) {
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
  if (file.status === "DRAFT") throw new ApiError(403, "Ce fichier n'est pas disponible");
  if (onlyApproved && !["APPROVED", "FINAL_APPROVED"].includes(file.status)) {
    throw new ApiError(403, "Ce fichier n'est pas validé");
  }

  const originalKey = file.versions[0]?.originalKey;
  if (!originalKey) throw new ApiError(404, "Fichier S3 introuvable");

  const downloadUrl = await getSignedOriginalUrl(originalKey);
  return { id: file.id, filename: file.filename, downloadUrl };
}

async function eventPhotoLink(mediaEventId: string, photoId: string, onlyApproved: boolean) {
  const photo = await prisma.mediaPhoto.findFirst({
    where: { id: photoId, mediaEventId },
    select: { id: true, filename: true, originalKey: true, status: true },
  });

  if (!photo) throw new ApiError(404, "Photo introuvable");
  if (onlyApproved && photo.status !== "APPROVED") {
    throw new ApiError(403, "Cette photo n'est pas approuvée");
  }

  const downloadUrl = await getSignedOriginalUrl(photo.originalKey);
  return { id: photo.id, filename: photo.filename, downloadUrl };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  try {
    const { token, photoId } = await params;
    const shareToken = await validateMediaShareToken(token, "GALLERY");
    const onlyApproved = (shareToken.config as { onlyApproved?: boolean } | null)?.onlyApproved ?? false;

    // ── Projet : le "photoId" désigne un fichier du projet ──────────────────────
    if (shareToken.mediaProjectId) {
      return successResponse(await projectFileLink(shareToken.mediaProjectId, photoId, onlyApproved));
    }

    // Une photo n'appartient jamais à un projet : un jeton sans événement (ou délégué à un
    // projet, déjà traité ci-dessus) n'a rien de légitime à faire ici — refus inconditionnel
    // (spec 025).
    if (!shareToken.mediaEventId) throw new ApiError(404, "Photo introuvable");
    return successResponse(await eventPhotoLink(shareToken.mediaEventId, photoId, onlyApproved));
  } catch (error) {
    return errorResponse(error);
  }
}
