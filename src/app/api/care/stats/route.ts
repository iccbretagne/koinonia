/**
 * GET /api/care/stats — volumes des demandes de rendez-vous pastoral (état, accompagnant,
 * motifs de rejet) et suivi MSDP (spec 052, T61), réservé à la vue d'ensemble (`care:view`).
 */
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getCareAccess, getCareStats } from "@/modules/care";

export async function GET() {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const access = await getCareAccess(session, churchId);
    if (!access.canOverview) throw new Error("FORBIDDEN");

    return successResponse(await getCareStats(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}
