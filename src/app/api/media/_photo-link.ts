import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";

/**
 * Lien signé vers un média désigné par un jeton public (téléchargement ou galerie) : un
 * fichier du projet pour un jeton projet, une photo de l'événement sinon.
 */
export interface PhotoLinkOptions {
  /** Seuls les médias validés sont servis. */
  approvedOnly: boolean;
  signUrl: (key: string, filename: string) => Promise<string>;
  messages: { fileNotAvailable: string; fileNotApproved: string; photoNotApproved: string };
}

async function projectFileLink(mediaProjectId: string, fileId: string, options: PhotoLinkOptions) {
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
  if (file.status === "DRAFT") throw new ApiError(403, options.messages.fileNotAvailable);
  if (options.approvedOnly && !["APPROVED", "FINAL_APPROVED"].includes(file.status)) {
    throw new ApiError(403, options.messages.fileNotApproved);
  }

  const originalKey = file.versions[0]?.originalKey;
  if (!originalKey) throw new ApiError(404, "Fichier S3 introuvable");

  const downloadUrl = await options.signUrl(originalKey, file.filename);
  return { id: file.id, filename: file.filename, downloadUrl };
}

async function eventPhotoLink(mediaEventId: string, photoId: string, options: PhotoLinkOptions) {
  const photo = await prisma.mediaPhoto.findFirst({
    where: { id: photoId, mediaEventId },
    select: { id: true, filename: true, originalKey: true, status: true },
  });

  if (!photo) throw new ApiError(404, "Photo introuvable");
  if (options.approvedOnly && photo.status !== "APPROVED") {
    throw new ApiError(403, options.messages.photoNotApproved);
  }

  const downloadUrl = await options.signUrl(photo.originalKey, photo.filename);
  return { id: photo.id, filename: photo.filename, downloadUrl };
}

export async function resolvePhotoLink(
  shareToken: { mediaProjectId: string | null; mediaEventId: string | null },
  photoId: string,
  options: PhotoLinkOptions
) {
  // ── Projet : le "photoId" désigne un fichier du projet ──────────────────────
  if (shareToken.mediaProjectId) {
    return projectFileLink(shareToken.mediaProjectId, photoId, options);
  }

  // ── Événement : photo ───────────────────────────────────────────────────────
  // Une photo n'appartient jamais à un projet : un jeton sans événement (ou délégué à un
  // projet, déjà traité ci-dessus) n'a rien de légitime à faire ici — refus inconditionnel
  // (spec 025).
  if (!shareToken.mediaEventId) throw new ApiError(404, "Photo introuvable");
  return eventPhotoLink(shareToken.mediaEventId, photoId, options);
}
