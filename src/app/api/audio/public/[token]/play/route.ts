/**
 * POST /api/audio/public/[token]/play
 * Incrémente le compteur de lecture d'un segment publié — pas d'authentification, rate-limité
 * par IP pour éviter le gonflage artificiel du compteur (spec §6).
 */
import { z } from "zod";
import { requireRateLimit, getClientIp, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const schema = z.object({ segmentId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { segmentId } = schema.parse(await request.json());

    // La cle doit identifier l'appelant : un prefixe constant ferait un compteur global
    // qui bloquerait toutes les lectures publiques apres 30 requetes (cf. requireRateLimit).
    requireRateLimit(request, {
      prefix: `audio:play:${token}:${getClientIp(request)}`,
      ...RATE_LIMIT_MUTATION,
    });

    const shareToken = await prisma.audioShareToken.findUnique({ where: { token } });
    if (!shareToken || shareToken.revokedAt) throw new ApiError(404, "Lien introuvable");
    if (shareToken.segmentId && shareToken.segmentId !== segmentId) {
      throw new ApiError(403, "Segment hors périmètre de ce lien");
    }

    const segment = await prisma.audioSegment.findUnique({
      where: { id: segmentId },
      select: { id: true, serviceId: true },
    });
    if (!segment || segment.serviceId !== shareToken.serviceId) {
      throw new ApiError(404, "Segment introuvable");
    }

    await prisma.audioSegment.update({
      where: { id: segmentId },
      data: { playCount: { increment: 1 } },
    });

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
