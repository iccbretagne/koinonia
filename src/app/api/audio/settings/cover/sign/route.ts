/**
 * POST /api/audio/settings/cover/sign — presigned PUT URL pour uploader directement
 * navigateur → S3 la couverture par défaut du module audio.
 */
import { z } from "zod";
import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { validateCoverFile, getCoverExtensionFromMimeType, getDefaultCoverKey } from "@/modules/audio";
import { getSignedPutUrl, getSignedStreamUrl } from "@/modules/storage";

const signSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const session = await requirePermission("audio:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = signSchema.parse(await request.json());
    validateCoverFile(body.mimeType, body.size);

    const ext = getCoverExtensionFromMimeType(body.mimeType);
    const key = getDefaultCoverKey(churchId, crypto.randomUUID(), ext);

    // `previewUrl` est signée ici plutôt que construite côté navigateur : l'aperçu reflète
    // ainsi l'objet réellement déposé sur S3, et son `src` ne dérive jamais d'une lecture du
    // DOM (`URL.createObjectURL` sur le fichier choisi) — cf. alerte CodeQL js/xss-through-dom.
    const [url, previewUrl] = await Promise.all([
      getSignedPutUrl(key, body.mimeType),
      getSignedStreamUrl(key),
    ]);

    return successResponse({ key, url, previewUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
