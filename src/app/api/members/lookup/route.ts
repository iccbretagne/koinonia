import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { searchMembersChurchWide } from "@/modules/planning";

/**
 * Recherche de STAR à l'échelle de l'église, sans filtre de périmètre.
 *
 * Complète `GET /api/members`, scopé aux départements de l'appelant : pour rattacher un STAR
 * existant à son département, un responsable doit d'abord pouvoir le trouver hors de son
 * périmètre. La réponse se limite donc à l'identité et aux départements d'appartenance.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const q = (searchParams.get("q") ?? "").trim();

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);

    return successResponse(await searchMembersChurchWide(churchId, q));
  } catch (error) {
    return errorResponse(error);
  }
}
