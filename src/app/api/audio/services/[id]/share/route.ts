/**
 * POST /api/audio/services/[id]/share — obtenir un lien de partage depuis la bibliothèque
 * d'écoute (spec 021). Sans `segmentId` : lien vers le culte entier. Réutilise un token existant
 * non révoqué avant d'en créer un — repartager la même séquence ne multiplie pas les liens.
 */
import { z } from "zod";
import { requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getOrCreatePrimaryShareToken, getOrCreateSegmentShareToken, buildPublicAudioUrl } from "@/modules/audio";

const schema = z.object({ segmentId: z.string().optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { segmentId } = schema.parse(await request.json());

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true, status: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireChurchPermission("audio:listen", service.churchId);

    if (service.status !== "PUBLISHED") throw new ApiError(410, "Ce culte n'est plus disponible.");

    if (segmentId) {
      const segment = await prisma.audioSegment.findUnique({ where: { id: segmentId }, select: { serviceId: true } });
      if (!segment || segment.serviceId !== id) throw new ApiError(404, "Séquence introuvable");
    }

    const token = segmentId
      ? await getOrCreateSegmentShareToken(id, segmentId, service.churchId)
      : await getOrCreatePrimaryShareToken(id, service.churchId);

    return successResponse({ url: buildPublicAudioUrl(token.token) });
  } catch (error) {
    return errorResponse(error);
  }
}
