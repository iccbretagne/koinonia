/**
 * DELETE /api/audio/services/[id]/sources/[sourceId]
 * Retire une séquence déposée par erreur (mauvais fichier, doublon…) tant que le culte est
 * encore en dépôt (DRAFT/PENDING_REVIEW).
 */
import { requireAudioAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { deleteAudioSource } from "@/modules/audio";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id, sourceId } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:upload", service.churchId);

    await deleteAudioSource(id, service.churchId, sourceId);

    return successResponse({ deleted: sourceId });
  } catch (error) {
    return errorResponse(error);
  }
}
