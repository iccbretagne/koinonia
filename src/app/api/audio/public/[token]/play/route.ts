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

    // Increment conditionnel en une seule instruction : le statut publie entre dans le
    // `where` plutot que d'etre verifie avant l'ecriture, ce qui supprime la fenetre entre
    // les deux. Sans ce controle, un ancien lien non revoque continuait de gonfler le
    // compteur d'un culte depublie, que le streaming refuse pourtant deja (spec 029).
    const { count } = await prisma.audioSegment.updateMany({
      where: {
        id: segmentId,
        serviceId: shareToken.serviceId,
        service: { status: "PUBLISHED" },
      },
      data: { playCount: { increment: 1 } },
    });
    if (count === 0) {
      throw new ApiError(410, "Ce culte n'est plus disponible.");
    }

    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
