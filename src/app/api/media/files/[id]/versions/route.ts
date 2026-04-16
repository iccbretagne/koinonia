/**
 * GET/POST /api/media/files/[id]/versions
 * GET : liste les versions d'un fichier média.
 * POST : démarre l'upload d'une nouvelle version (retourne une URL pré-signée).
 *
 * Flow :
 *   1. POST ici → URL pré-signée S3 + version record créé (status DRAFT)
 *   2. Client upload direct vers S3
 *   3. PATCH /api/media/files/[id] avec originalKey pour confirmer l'upload
 */
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getVersionOriginalKey, getVersionThumbnailKey, getSignedOriginalUrl } from "@/modules/media";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { z } from "zod";

const PRESIGNED_EXPIRY = 3600;

const postSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  notes: z.string().optional(),
});

async function resolveFileChurchId(fileId: string) {
  const file = await prisma.mediaFile.findUnique({
    where: { id: fileId },
    include: {
      mediaEvent: { select: { churchId: true } },
      mediaProject: { select: { churchId: true } },
    },
  });
  if (!file) throw new ApiError(404, "Fichier introuvable");
  return { churchId: file.mediaEvent?.churchId ?? file.mediaProject?.churchId!, file };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId } = await resolveFileChurchId(id);
    await requireChurchPermission("media:view", churchId);

    const versions = await prisma.mediaFileVersion.findMany({
      where: { mediaFileId: id },
      orderBy: { versionNumber: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
    });

    // Ajouter une URL signée (stream) pour chaque version
    const versionsWithUrls = await Promise.all(
      versions.map(async (v) => {
        let streamUrl: string | null = null;
        try {
          streamUrl = await getSignedOriginalUrl(v.originalKey);
        } catch (err) {
          console.error(`[versions] getSignedOriginalUrl failed for key "${v.originalKey}":`, err);
        }
        return { ...v, streamUrl };
      })
    );

    return successResponse({ data: versionsWithUrls });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { churchId, file } = await resolveFileChurchId(id);
    const session = await requireChurchPermission("media:upload", churchId);

    if (file.type === "PHOTO") throw new ApiError(400, "Les photos ne supportent pas le versionnage");

    const body = await request.json();
    const data = postSchema.parse(body);

    const latestVersion = await prisma.mediaFileVersion.findFirst({
      where: { mediaFileId: id },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "bin";
    const originalKey = getVersionOriginalKey(id, nextVersion, ext);
    const thumbnailKey = getVersionThumbnailKey(id, nextVersion);

    const version = await prisma.mediaFileVersion.create({
      data: {
        mediaFileId: id,
        versionNumber: nextVersion,
        originalKey,
        thumbnailKey,
        notes: data.notes,
        createdById: session.user.id,
      },
    });

    // Reset status to IN_REVIEW when new version is uploaded
    await prisma.mediaFile.update({
      where: { id },
      data: { status: "IN_REVIEW", filename: data.filename, mimeType: data.contentType },
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET ?? "", Key: originalKey, ContentType: data.contentType }),
      { expiresIn: PRESIGNED_EXPIRY }
    );

    return successResponse({ version, uploadUrl, expiresIn: PRESIGNED_EXPIRY }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
