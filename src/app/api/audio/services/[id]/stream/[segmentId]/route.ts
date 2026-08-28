/**
 * GET /api/audio/services/[id]/stream/[segmentId]
 * Streaming interne (bibliothèque d'écoute, spec 021) — distinct de la route publique par
 * token : ici l'accès passe par une session authentifiée et `audio:listen`.
 */
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { buildRenditionResponse } from "@/modules/audio";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id, segmentId } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true, status: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requirePermission("audio:listen", service.churchId);

    if (service.status !== "PUBLISHED") throw new ApiError(410, "Ce culte n'est plus disponible.");

    const segment = await prisma.audioSegment.findUnique({
      where: { id: segmentId },
      include: { rendition: true },
    });
    if (!segment || segment.serviceId !== id || !segment.rendition) {
      throw new ApiError(404, "Séquence introuvable");
    }

    return await buildRenditionResponse(segment.rendition.s3Key, request.headers.get("Range"));
  } catch (error) {
    return errorResponse(error);
  }
}
