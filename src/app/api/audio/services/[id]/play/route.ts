/**
 * POST /api/audio/services/[id]/play — comptabilise la lecture d'une séquence par un membre
 * (spec 021). Incrémente `AudioSegment.playCount`, jamais `AudioService.openCount` (qui mesure
 * la diffusion d'un lien de partage, une sémantique distincte).
 */
import { z } from "zod";
import { requireAudioListenAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const schema = z.object({ segmentId: z.string() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { segmentId } = schema.parse(await request.json());

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true, status: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioListenAccess(service.churchId);

    if (service.status !== "PUBLISHED") throw new ApiError(410, "Ce culte n'est plus disponible.");

    const segment = await prisma.audioSegment.findUnique({ where: { id: segmentId }, select: { serviceId: true } });
    if (!segment || segment.serviceId !== id) throw new ApiError(404, "Séquence introuvable");

    await prisma.audioSegment.update({ where: { id: segmentId }, data: { playCount: { increment: 1 } } });

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
