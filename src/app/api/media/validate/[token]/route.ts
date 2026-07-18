/**
 * GET /api/media/validate/[token]
 * Retourne l'événement ou le projet média (photos/fichiers à valider).
 * Accessible sans authentification via un token de partage VALIDATOR ou PREVALIDATOR.
 */
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateMediaShareToken, resolveValidatorData } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);
    const data = await resolveValidatorData(shareToken);
    return successResponse(data ?? { token: { id: shareToken.id, type: shareToken.type, label: shareToken.label }, event: null });
  } catch (error) {
    return errorResponse(error);
  }
}
