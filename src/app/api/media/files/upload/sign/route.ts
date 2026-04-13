/**
 * POST /api/media/files/upload/sign
 * Demande une URL pré-signée pour uploader directement un fichier média vers S3.
 * Pour les fichiers VISUAL et VIDEO (pas les photos — celles-ci passent par /api/media-events/[id]/photos).
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getFileOriginalKey } from "@/modules/media";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { z } from "zod";

const PRESIGNED_EXPIRY = 3600; // 1h
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const ALLOWED_MIME_TYPES = [
  // Images / visuels
  "image/jpeg", "image/png", "image/webp", "image/svg+xml", "application/pdf",
  // Vidéos
  "video/mp4", "video/quicktime", "video/webm",
];

const schema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  type: z.enum(["VISUAL", "VIDEO"]),
  mediaEventId: z.string().optional(),
  mediaProjectId: z.string().optional(),
}).refine((d) => d.mediaEventId || d.mediaProjectId, { message: "mediaEventId ou mediaProjectId requis" });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = schema.parse(body);

    if (!ALLOWED_MIME_TYPES.includes(data.contentType)) {
      throw new ApiError(400, `Type MIME non supporté : ${data.contentType}`);
    }
    if (data.size > MAX_FILE_SIZE) {
      throw new ApiError(400, `Fichier trop lourd (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    // Resolve church from target
    const churchId = data.mediaEventId
      ? await resolveChurchId("mediaEvent", data.mediaEventId)
      : await resolveChurchId("mediaProject", data.mediaProjectId!);

    const session = await requireChurchPermission("media:upload", churchId);
    requireRateLimit(request, { prefix: `media:upload:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "bin";

    // Pre-create the MediaFile record to get its id (for S3 key)
    const container = data.mediaEventId ? "media-events" : "media-projects";
    const containerId = data.mediaEventId ?? data.mediaProjectId!;

    const file = await prisma.mediaFile.create({
      data: {
        type: data.type,
        status: "DRAFT",
        filename: data.filename,
        mimeType: data.contentType,
        size: data.size,
        ...(data.mediaEventId && { mediaEventId: data.mediaEventId }),
        ...(data.mediaProjectId && { mediaProjectId: data.mediaProjectId }),
      },
    });

    const originalKey = getFileOriginalKey(container, containerId, file.id, 1, ext);

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET ?? "", Key: originalKey, ContentType: data.contentType }),
      { expiresIn: PRESIGNED_EXPIRY }
    );

    return successResponse({ fileId: file.id, uploadUrl: url, key: originalKey, expiresIn: PRESIGNED_EXPIRY }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
