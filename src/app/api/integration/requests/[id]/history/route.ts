import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess, getRequestHistory, getRequestAccessInfo } from "@/modules/integration";

/** Historique des changements d'état d'une demande, affiché sur sa fiche (spec 051). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const req = await getRequestAccessInfo(id);
    if (!req) throw new ApiError(404, "Demande introuvable");

    const { scope } = await requireIntegrationAccess(req.churchId);
    if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
      throw new ApiError(403, "Accès refusé");

    return successResponse({ entries: await getRequestHistory(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
