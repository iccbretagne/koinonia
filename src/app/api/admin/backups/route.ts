import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requirePermission } from "@/lib/auth";
import { isS3Configured } from "@/lib/s3";
import { createBackup, listBackups } from "@/lib/backup";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requirePermission("church:manage");

    if (!isS3Configured()) {
      throw new ApiError(400, "S3 backup is not configured");
    }

    const backups = await listBackups();
    return successResponse(backups);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const session = await requirePermission("church:manage");

    if (!isS3Configured()) {
      throw new ApiError(400, "S3 backup is not configured");
    }

    const backup = await createBackup();

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Backup",
      entityId: backup.key,
      details: { sizeBytes: backup.sizeBytes, durationMs: backup.durationMs },
    });

    return successResponse(backup, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
