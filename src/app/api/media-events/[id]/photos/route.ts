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

    return successResponse(photos);
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
