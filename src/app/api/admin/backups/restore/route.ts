import { z } from "zod";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { isS3Configured } from "@/lib/s3";
import { listBackups } from "@/lib/backup";
import { restoreBackup } from "@/lib/restore";
import { logAudit } from "@/lib/audit";

const restoreSchema = z.object({
  key: z
    .string()
    .startsWith("backups/")
    .endsWith(".sql.gz"),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) {
      throw new ApiError(403, "Réservé aux super-administrateurs");
    }

    if (!isS3Configured()) {
      throw new ApiError(400, "S3 backup is not configured");
    }

    const body = restoreSchema.parse(await request.json());

    // Verify the backup exists
    const backups = await listBackups();
    const exists = backups.some((b) => b.key === body.key);
    if (!exists) {
      throw new ApiError(404, "Backup not found");
    }

    const result = await restoreBackup(body.key);

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Backup",
      entityId: body.key,
      details: { operation: "restore", durationMs: result.durationMs },
    });

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
