import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listMyRequests } from "@/modules/care";

/** Demandes du demandeur connecté, sans l'accompagnant (T45, T49 — « Mes demandes »). */
export async function GET() {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const requests = await listMyRequests(session.user.id!, churchId);
    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}
