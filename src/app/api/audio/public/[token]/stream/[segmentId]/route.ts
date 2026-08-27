/**
 * GET /api/audio/public/[token]/stream/[segmentId]
 * Redirige (302) vers une URL S3 signée servant la rendition MP3 d'un segment publié — le
 * Range HTTP natif de S3 permet la lecture/seek côté navigateur sans proxy.
 */
import { prisma } from "@/lib/prisma";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { getSignedStreamUrl } from "@/modules/storage";

export async function GET(
  _request: Request,
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

    const url = await getSignedStreamUrl(segment.rendition.s3Key);
    return Response.redirect(url, 302);
  } catch (error) {
    return errorResponse(error);
  }
}
