import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  getCareAccess,
  getMsdpFollowUpById,
  applyFollowupTransition,
  msdpPatchSchema,
} from "@/modules/care";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const followUp = await getMsdpFollowUpById(id);
    if (!followUp) throw new ApiError(404, "Suivi MSDP introuvable");

    const session = await requireAuth();
    const access = await getCareAccess(session, followUp.churchId);
    const isCurrentAssignee =
      session.user.id === followUp.assignedConseillerMsdpId ||
      session.user.id === followUp.assignedProfile?.userId;
    if (!access.canOverview && !isCurrentAssignee) throw new ApiError(403, "Accès refusé");

    return successResponse(followUp);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Actions assign/reassign/contact/in_formation/complete/abandon/reopen/handback/note (spec
 * 052, lot 2) — le droit par action est porté par la machine à états pure
 * (`followup-state.ts`) : pas de garde supplémentaire ici au-delà de l'authentification.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const followUp = await getMsdpFollowUpById(id);
    if (!followUp) throw new ApiError(404, "Suivi MSDP introuvable");

    const session = await requireAuth();
    const access = await getCareAccess(session, followUp.churchId);

    const body = msdpPatchSchema.parse(await request.json());

    const updated = await applyFollowupTransition({
      id,
      churchId: followUp.churchId,
      body,
      actorId: session.user.id!,
      isReferent: access.canQualify,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
