/**
 * POST /api/media/library/zip — archive d'une sélection de la galerie (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryAccess } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { resolveLibraryOriginals } from "@/modules/media";
import { streamZip } from "../../_zip";
import { zipBodySchema } from "./contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireMediaGalleryAccess(churchId);

    const body = zipBodySchema.parse(await request.json());
    const entries = await resolveLibraryOriginals(churchId, body.photoIds, body.fileIds);
    if (entries.length === 0) throw new ApiError(404, "Aucun média disponible");

    const date = new Date().toISOString().slice(0, 10);
    return new Response(streamZip(entries), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="galerie-${date}.zip"`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
