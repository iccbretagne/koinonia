import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMediaUploadAccess, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  validatePhotoFile,
  getExtensionFromMimeType,
  getQuarantineKey,
  fileExists,
  downloadFile,
  processImage,
  uploadMediaFile,
  getPhotoOriginalKey,
  getPhotoThumbnailKey,
  deleteMediaFile,
} from "@/modules/media";

const confirmSchema = z.object({
  quarantineId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

/** POST — confirme l'upload S3, traite l'image (sharp) et crée l'entrée DB. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("mediaEvent", id);
    await requireMediaUploadAccess(churchId);

    const body = confirmSchema.parse(await request.json());
    validatePhotoFile(body.filename, body.mimeType, body.size);

    const ext = getExtensionFromMimeType(body.mimeType);
    const quarantineKey = getQuarantineKey(id, body.quarantineId, ext);

    if (!(await fileExists(quarantineKey))) {
      throw new ApiError(400, "Fichier introuvable — re-uploadez la photo");
    }

    const buffer = await downloadFile(quarantineKey);
    const processed = await processImage(buffer);

    const photo = await prisma.mediaPhoto.create({
      data: {
        filename: body.filename,
        mimeType: body.mimeType,
        size: body.size,
        width: processed.metadata.width,
        height: processed.metadata.height,
        mediaEventId: id,
        originalKey: "",
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

    // Nettoyage quarantine (best-effort, non bloquant)
    deleteMediaFile(quarantineKey).catch(() => {});

    return successResponse({ id: photo.id, filename: photo.filename }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
