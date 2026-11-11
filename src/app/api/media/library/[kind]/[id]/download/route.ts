/**
 * GET /api/media/library/[kind]/[id]/download — original HD d'un média de la galerie (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryAccess } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { resolveLibraryOriginals, getSignedDownloadUrl } from "@/modules/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  try {
    const { kind, id } = await params;
    if (kind !== "photo" && kind !== "file") throw new ApiError(404, "Média introuvable");
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireMediaGalleryAccess(churchId);

    const [original] = await resolveLibraryOriginals(churchId, kind === "photo" ? [id] : [], kind === "file" ? [id] : []);
    if (!original) throw new ApiError(404, "Média introuvable");
    const url = await getSignedDownloadUrl(original.originalKey, original.filename);
    return Response.redirect(url, 302);
  } catch (error) {
    return errorResponse(error);
  }
}
