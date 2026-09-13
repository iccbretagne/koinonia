/**
 * DELETE /api/media/shares/[id]
 * Révoque un lien de partage — le périmètre requis est résolu depuis le lien lui-même
 * (`revokeShare`), pas depuis l'église courante du client.
 */
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { revokeShare } from "@/modules/media";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await revokeShare(id, session);
    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
