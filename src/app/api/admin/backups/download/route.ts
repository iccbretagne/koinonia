import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { s3, isS3Configured } from "@/lib/s3";

async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) {
    throw new ApiError(403, "Réservé aux super-administrateurs");
  }
  return session;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();

    if (!isS3Configured()) {
      throw new ApiError(400, "S3 backup is not configured");
    }

    const key = new URL(request.url).searchParams.get("key");
    if (!key) throw new ApiError(400, "Paramètre key requis");

    // Validate key to prevent path traversal
    if (!key.startsWith("backups/") || !key.endsWith(".sql.gz") || key.includes("..")) {
      throw new ApiError(400, "Clé de sauvegarde invalide");
    }

    const bucket = process.env.BACKUP_S3_BUCKET!;
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${key.split("/").at(-2)}-db.sql.gz"`,
      }),
      { expiresIn: 300 } // 5 minutes
    );

    return successResponse({ url });
  } catch (error) {
    return errorResponse(error);
  }
}
