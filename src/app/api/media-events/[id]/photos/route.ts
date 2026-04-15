import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  processImage,
  validatePhotoFile,
  getExtensionFromMimeType,
  uploadMediaFile,
  getPhotoOriginalKey,
  getPhotoThumbnailKey,
  getSignedThumbnailUrl,
  deleteMediaFile,
} from "@/modules/media";
import { z } from "zod";

const patchSchema = z.object({
  photoIds: z.array(z.string()).min(1),
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:view", churchId);

    const photos = await prisma.mediaPhoto.findMany({
      where: { mediaEventId: id },
      orderBy: { uploadedAt: "desc" },
    });

    const photosWithUrls = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        thumbnailUrl: p.thumbnailKey ? await getSignedThumbnailUrl(p.thumbnailKey) : null,
      }))
    );

    return successResponse(photosWithUrls);
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — upload de photos (multipart/form-data, champ "files[]"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:upload", churchId);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) throw new ApiError(400, "Aucun fichier fourni");

    const uploaded: { id: string; filename: string }[] = [];
    const errors: { filename: string; error: string }[] = [];

    for (const file of files) {
      try {
        validatePhotoFile(file.name, file.type, file.size);

        const buffer = Buffer.from(await file.arrayBuffer());
        const processed = await processImage(buffer);
        const ext = getExtensionFromMimeType(file.type);

        const photo = await prisma.mediaPhoto.create({
          data: {
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            width: processed.metadata.width,
            height: processed.metadata.height,
            mediaEventId: id,
            originalKey: "", // placeholders, updated below
            thumbnailKey: "",
            status: "PENDING",
          },
        });

        const originalKey = getPhotoOriginalKey(id, photo.id, ext);
        const thumbnailKey = getPhotoThumbnailKey(id, photo.id);

        await Promise.all([
          uploadMediaFile(originalKey, processed.original, "image/jpeg"),
          uploadMediaFile(thumbnailKey, processed.thumbnail, "image/webp"),
        ]);

        await prisma.mediaPhoto.update({
          where: { id: photo.id },
          data: { originalKey, thumbnailKey },
        });

        uploaded.push({ id: photo.id, filename: file.name });
      } catch (err) {
        errors.push({
          filename: file.name,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    return successResponse({ uploaded, errors }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — mise à jour de statut en masse (validation/rejet). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:review", churchId);

    const body = await request.json();
    const data = patchSchema.parse(body);

    const result = await prisma.mediaPhoto.updateMany({
      where: { mediaEventId: id, id: { in: data.photoIds } },
      data: {
        status: data.status,
        validatedAt: new Date(),
      },
    });

    return successResponse({ updated: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — suppression d'une ou plusieurs photos (?photoIds=id1,id2). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireChurchPermission("media:upload", churchId);

    const url = new URL(request.url);
    const raw = url.searchParams.get("photoIds") ?? "";
    const photoIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (photoIds.length === 0) throw new ApiError(400, "photoIds requis");

    const photos = await prisma.mediaPhoto.findMany({
      where: { id: { in: photoIds }, mediaEventId: id },
      select: { id: true, originalKey: true, thumbnailKey: true },
    });

    if (photos.length === 0) throw new ApiError(404, "Photos introuvables");

    // Supprimer les fichiers S3
    await Promise.allSettled(
      photos.flatMap((p) => [
        deleteMediaFile(p.originalKey).catch(() => {}),
        deleteMediaFile(p.thumbnailKey).catch(() => {}),
      ])
    );

    await prisma.mediaPhoto.deleteMany({
      where: { id: { in: photos.map((p) => p.id) }, mediaEventId: id },
    });

    return successResponse({ deleted: photos.length });
  } catch (error) {
    return errorResponse(error);
  }
}
