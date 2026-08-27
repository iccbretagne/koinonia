/**
 * GET /api/audio/public/[token]
 * Métadonnées d'un culte publié + ses segments — pas d'authentification requise.
 * Distingue un token inexistant (404 générique) d'un lien révoqué ou d'un culte dépublié
 * (410, réponse dédiée affichée par la page publique comme un message compréhensible plutôt
 * qu'une erreur brute — spec §3 « dépublier… message compréhensible »).
 */
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { resolvePublicAudioService, recordAudioServiceOpen } from "@/modules/audio";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await resolvePublicAudioService(token);

    if (result.status === "NOT_FOUND") throw new ApiError(404, "Lien introuvable");
    if (result.status === "REVOKED") throw new ApiError(410, "Ce lien a été révoqué.");
    if (result.status === "UNAVAILABLE") throw new ApiError(410, "Ce culte n'est plus disponible.");

    const shareToken = await prisma.audioShareToken.findUnique({ where: { token }, select: { serviceId: true } });
    if (shareToken) await recordAudioServiceOpen(shareToken.serviceId);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
