/**
 * GET /api/media/download/[token]
 * Retourne les médias accessibles au téléchargement (token MEDIA / MEDIA_ALL).
 * - Token lié à un événement : photos (approuvées, ou toutes si MEDIA_ALL).
 * - Token lié à un projet : fichiers validés (APPROVED/FINAL_APPROVED,
 *   ou tous les non-brouillons si MEDIA_ALL).
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, resolveDownloadData } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);
    return successResponse(await resolveDownloadData(shareToken));
  } catch (error) {
    return errorResponse(error);
  }
}
