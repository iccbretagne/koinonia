/**
 * POST /api/audio/services/[id]/publish
 * Génère les jobs RENDER manquants (idempotence sourceHash) et publie le culte.
 */
import { requireAudioAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { publishAudioService } from "@/modules/audio";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    const session = await requireAudioAccess("audio:review", service.churchId);

    const updated = await publishAudioService(id, service.churchId, session.user.id);

    await logAudit({
      userId: session.user.id,
      churchId: service.churchId,
      action: "UPDATE",
      entityType: "AudioService",
      entityId: id,
      details: { action: "publish", status: updated.status },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
