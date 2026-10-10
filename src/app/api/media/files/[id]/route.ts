/**
 * GET/PATCH/DELETE /api/media/files/[id]
 * CRUD sur un fichier média (visual/vidéo).
 */
import { prisma } from "@/lib/prisma";
import { requireMediaAccess, requireMediaUploadAccess, requireMediaManageAccess, requireMediaReviewAccess, type MediaDomain } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { deleteMediaFiles, getMediaObjectSize } from "@/lib/s3";
import { getFileOriginalKey, MAX_FILE_SIZE } from "@/modules/media";
import { createNotification } from "@/lib/notifications";
import type { z } from "zod";
import { patchSchema } from "./contract";

type MediaFileWithContainers = {
  id: string;
  filename: string;
  mediaEventId: string | null;
  mediaProjectId: string | null;
  mediaEvent: { churchId: string } | null;
  mediaProject: { churchId: string; createdById: string } | null;
};

async function resolveMediaFileChurchId(
  fileId: string
): Promise<{ churchId: string; domain: MediaDomain; file: MediaFileWithContainers }> {
  const { ApiError } = await import("@/lib/api-utils");
  const file = await prisma.mediaFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      filename: true,
      mediaEventId: true,
      mediaProjectId: true,
      mediaEvent: { select: { churchId: true } },
      mediaProject: { select: { churchId: true, createdById: true } },
    },
  });
  if (!file) throw new ApiError(404, "Fichier média introuvable");
  const churchId = file.mediaEvent?.churchId ?? file.mediaProject?.churchId ?? (() => { throw new ApiError(500, "Fichier sans conteneur"); })();
  const domain: MediaDomain = file.mediaEventId ? "PHOTOS" : "VISUELS";
  return { churchId, domain, file };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId, domain } = await resolveMediaFileChurchId(id);
    await requireMediaAccess(churchId, domain);

    const file = await prisma.mediaFile.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        _count: { select: { comments: true } },
      },
    });

    if (!file) throw new ApiError(404, "Fichier média introuvable");
    return successResponse(file);
  } catch (error) {
    return errorResponse(error);
  }
}

type MediaFileContext = Awaited<ReturnType<typeof resolveMediaFileChurchId>>["file"];

function fileUpdateData(data: z.infer<typeof patchSchema>) {
  const updates: Record<string, unknown> = {};
  for (const key of ["status", "filename", "width", "height", "duration"] as const) {
    if (data[key] !== undefined) updates[key] = data[key];
  }
  return updates;
}

/**
 * Première version d'un fichier déposé, avec une clé dérivée côté serveur. La borne de taille
 * validée à la signature ne portait que sur la taille ANNONCÉE : une URL présignée PutObject
 * n'impose aucune limite, le fichier réellement déposé peut donc être bien plus gros. On
 * constate ici sa taille réelle avant de l'accepter dans le circuit de revue (spec 029).
 */
async function confirmFirstVersion(id: string, mediaFile: MediaFileContext, userId: string) {
  const existingVersions = await prisma.mediaFileVersion.count({ where: { mediaFileId: id } });
  if (existingVersions > 0) return;

  const ext = mediaFile.filename.split(".").pop()?.toLowerCase() ?? "bin";
  const container = mediaFile.mediaEventId ? ("media-events" as const) : ("media-projects" as const);
  const containerId = (mediaFile.mediaEventId ?? mediaFile.mediaProjectId)!;
  const derivedKey = getFileOriginalKey(container, containerId, id, 1, ext);

  const actualSize = await getMediaObjectSize(derivedKey);
  if (actualSize === null) {
    throw new ApiError(404, "Fichier déposé introuvable — le dépôt n'a pas abouti.");
  }
  if (actualSize > MAX_FILE_SIZE) {
    await deleteMediaFiles([derivedKey]);
    throw new ApiError(400, `Fichier trop lourd (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  await prisma.mediaFileVersion.create({
    data: {
      mediaFileId: id,
      versionNumber: 1,
      originalKey: derivedKey,
      thumbnailKey: derivedKey,
      createdById: userId,
    },
  });
  await prisma.mediaFile.update({
    where: { id },
    data: { status: "IN_REVIEW", size: actualSize },
  });
}

const STATUS_NOTIFICATIONS: Partial<Record<string, { title: string; message: string }>> = {
  APPROVED: { title: "Fichier approuvé", message: "Un fichier de votre projet média a été approuvé." },
  FINAL_APPROVED: { title: "Fichier validé définitivement", message: "Un fichier de votre projet média a reçu la validation finale." },
  REJECTED: { title: "Fichier refusé", message: "Un fichier de votre projet média a été refusé." },
  REVISION_REQUESTED: { title: "Révision demandée", message: "Une révision a été demandée sur un fichier de votre projet média." },
};

/** Prévient le créateur du projet d'un changement de statut (pas d'une revue faite par lui-même). */
function notifyProjectCreator(mediaFile: MediaFileContext, status: string, userId: string) {
  const creatorId = mediaFile.mediaProject?.createdById ?? null;
  const notif = STATUS_NOTIFICATIONS[status];
  if (!creatorId || creatorId === userId || !notif) return;
  createNotification({
    userId: creatorId,
    domain: "media",
    type: `MEDIA_FILE_${status}`,
    title: notif.title,
    message: notif.message,
    link: "/media/projects",
  }).catch(() => {});
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId, domain, file: mediaFile } = await resolveMediaFileChurchId(id);
    const session = await requireMediaUploadAccess(churchId, domain);

    const body = await request.json();
    const data = patchSchema.parse(body);

    // Status transitions to APPROVED/REJECTED require media:review
    if (data.status && ["APPROVED", "REJECTED", "FINAL_APPROVED"].includes(data.status)) {
      await requireMediaReviewAccess(churchId, domain);
    }

    const file = await prisma.mediaFile.update({ where: { id }, data: fileUpdateData(data) });

    // If upload confirmed, create version 1 with server-derived key (never trust client-supplied keys)
    if (data.confirmUpload) await confirmFirstVersion(id, mediaFile, session.user.id);

    // Notify project creator on status change (not for self-reviews)
    if (data.status) notifyProjectCreator(mediaFile, data.status, session.user.id);

    return successResponse(file);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId, domain } = await resolveMediaFileChurchId(id);
    await requireMediaManageAccess(churchId, domain);

    const file = await prisma.mediaFile.findUnique({
      where: { id },
      include: { versions: { select: { originalKey: true, thumbnailKey: true } } },
    });
    if (!file) throw new ApiError(404, "Fichier média introuvable");

    const s3Keys = file.versions.flatMap((v) => [v.originalKey, v.thumbnailKey]);
    if (s3Keys.length > 0) await deleteMediaFiles(s3Keys);

    await prisma.mediaFile.delete({ where: { id } });

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
