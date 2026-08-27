/**
 * POST /api/audio/services/[id]/unpublish
 * Dépublie un culte — les liens déjà partagés deviennent inopérants. Geste plus lourd que
 * publier : audio:manage OU responsable (DEPARTMENT_HEAD/MINISTER) du département de captation.
 */
import { requireAudioUnpublishAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { unpublishAudioService } from "@/modules/audio";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    const session = await requireAudioUnpublishAccess(service.churchId);

    const updated = await unpublishAudioService(id, service.churchId);

    await logAudit({
      userId: session.user.id,
      churchId: service.churchId,
      action: "UPDATE",
      entityType: "AudioService",
      entityId: id,
      details: { action: "unpublish", status: updated.status },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
