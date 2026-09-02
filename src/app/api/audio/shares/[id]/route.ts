/**
 * DELETE /api/audio/shares/[id] — révocation d'un partage de bibliothèque audio (spec 036).
 * `audio:manage` dans l'église courante ; `revokeLibraryShare` vérifie en plus que le partage
 * appartient bien à cette église avant suppression (jamais confiance dans l'ID seul).
 */
import { requireCurrentChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { revokeLibraryShare } from "@/modules/audio";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, churchId } = await requireCurrentChurchPermission("audio:manage");

    await revokeLibraryShare(churchId, id);

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "AudioLibraryShare",
      entityId: id,
    });

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
