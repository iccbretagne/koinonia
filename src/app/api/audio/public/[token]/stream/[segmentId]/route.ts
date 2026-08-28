/**
 * GET /api/audio/public/[token]/stream/[segmentId]
 * Sert la rendition MP3 d'un segment publié depuis le cache disque local (ADR-0008), en
 * honorant le `Range` HTTP — remplace l'ancienne redirection 302 vers une URL S3 signée, qui
 * empêchait tout cache navigateur et facturait l'egress à chaque écoute.
 */
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { buildRenditionResponse } from "@/modules/audio";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; segmentId: string }> }
) {
  try {
    const { token, segmentId } = await params;

    const shareToken = await prisma.audioShareToken.findUnique({ where: { token } });
    if (!shareToken || shareToken.revokedAt) throw new ApiError(404, "Lien introuvable");
    if (shareToken.segmentId && shareToken.segmentId !== segmentId) {
      throw new ApiError(403, "Segment hors périmètre de ce lien");
    }

    const segment = await prisma.audioSegment.findUnique({
      where: { id: segmentId },
      include: { rendition: true, service: true },
    });
    if (!segment || segment.serviceId !== shareToken.serviceId) {
      throw new ApiError(404, "Segment introuvable");
    }
    if (segment.service.status !== "PUBLISHED" || !segment.rendition) {
      throw new ApiError(410, "Ce culte n'est plus disponible.");
    }

    return await buildRenditionResponse(segment.rendition.s3Key, request.headers.get("Range"));
  } catch (error) {
    return errorResponse(error);
  }
}
