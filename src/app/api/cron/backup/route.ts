import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { isS3Configured } from "@/lib/s3";
import { createBackup, cleanupOldBackups } from "@/lib/backup";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!isS3Configured()) {
      throw new ApiError(503, "S3 backup is not configured");
    }

    const backup = await createBackup();

    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
    let cleanedUp = 0;
    try {
      cleanedUp = await cleanupOldBackups(retentionDays);
    } catch (err) {
      logger.error({ msg: "Backup cleanup failed", error: String(err) });
    }

    logger.info({
      msg: "Cron backup completed",
      key: backup.key,
      sizeBytes: backup.sizeBytes,
      durationMs: backup.durationMs,
      cleanedUp,
    });

    return successResponse({ backup, cleanedUp });
  } catch (error) {
    return errorResponse(error);
  }
}
