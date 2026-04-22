/**
 * GET/PATCH/DELETE /api/media/files/[id]
 * CRUD sur un fichier média (visual/vidéo).
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { deleteMediaFiles } from "@/lib/s3";
import { getFileOriginalKey } from "@/modules/media";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum([
    "PENDING", "APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED",
    "DRAFT", "IN_REVIEW", "REVISION_REQUESTED", "FINAL_APPROVED",
  ]).optional(),
  filename: z.string().min(1).optional(),
  // Confirm upload: signal that presigned upload completed (key is derived server-side)
  confirmUpload: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
});

type MediaFileWithContainers = {
  id: string;
  filename: string;
  mediaEventId: string | null;
  mediaProjectId: string | null;
  mediaEvent: { churchId: string } | null;
  mediaProject: { churchId: string } | null;
};

async function resolveMediaFileChurchId(fileId: string): Promise<{ churchId: string; file: MediaFileWithContainers }> {
  const { ApiError } = await import("@/lib/api-utils");
  const file = await prisma.mediaFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      filename: true,
      mediaEventId: true,
      mediaProjectId: true,
      mediaEvent: { select: { churchId: true } },
      mediaProject: { select: { churchId: true } },
    },
  });
  if (!file) throw new ApiError(404, "Fichier média introuvable");
  const churchId = file.mediaEvent?.churchId ?? file.mediaProject?.churchId ?? (() => { throw new ApiError(500, "Fichier sans conteneur"); })();
  return { churchId, file };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId } = await resolveMediaFileChurchId(id);
    await requireChurchPermission("media:view", churchId);

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId, file: mediaFile } = await resolveMediaFileChurchId(id);
    const session = await requireChurchPermission("media:upload", churchId);

    const body = await request.json();
    const data = patchSchema.parse(body);

    // Status transitions to APPROVED/REJECTED require media:review
    if (data.status && ["APPROVED", "REJECTED", "FINAL_APPROVED"].includes(data.status)) {
      await requireChurchPermission("media:review", churchId);
    }

    const file = await prisma.mediaFile.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.filename !== undefined && { filename: data.filename }),
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
        ...(data.duration !== undefined && { duration: data.duration }),
      },
    });

    // If upload confirmed, create version 1 with server-derived key (never trust client-supplied keys)
    if (data.confirmUpload) {
      const existingVersions = await prisma.mediaFileVersion.count({ where: { mediaFileId: id } });
      if (existingVersions === 0) {
        const ext = mediaFile.filename.split(".").pop()?.toLowerCase() ?? "bin";
        const container = mediaFile.mediaEventId ? ("media-events" as const) : ("media-projects" as const);
        const containerId = (mediaFile.mediaEventId ?? mediaFile.mediaProjectId)!;
        const derivedKey = getFileOriginalKey(container, containerId, id, 1, ext);

        await prisma.mediaFileVersion.create({
          data: {
            mediaFileId: id,
            versionNumber: 1,
            originalKey: derivedKey,
            thumbnailKey: derivedKey,
            createdById: session.user.id,
          },
        });
        // Update status from DRAFT to IN_REVIEW
        await prisma.mediaFile.update({ where: { id }, data: { status: "IN_REVIEW" } });
      }
    }

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
    const { churchId } = await resolveMediaFileChurchId(id);
    await requireChurchPermission("media:manage", churchId);

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
