import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import {
  hasFollowupManagementAccess,
  getMsdpFollowUpById,
  applyMsdpTransition,
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
    const isManager = await hasFollowupManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    return successResponse(followUp);
  } catch (error) {
    return errorResponse(error);
  }
}

const MANAGER_ONLY_ACTIONS = ["assign_counselor", "reopen"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const followUp = await getMsdpFollowUpById(id);
    if (!followUp) throw new ApiError(404, "Suivi MSDP introuvable");

    const session = await requireAuth();
    const isManager = await hasFollowupManagementAccess(session, followUp.churchId);
    const isCounselor = session.user.id === followUp.assignedConseillerMsdpId;
    if (!isManager && !isCounselor) throw new ApiError(403, "Accès refusé");

    const body = msdpPatchSchema.parse(await request.json());
    if (MANAGER_ONLY_ACTIONS.includes(body.action) && !isManager)
      throw new ApiError(403, "Cette action est réservée aux membres de l'équipe intégration");

    const updated = await applyMsdpTransition({
      id,
      churchId: followUp.churchId,
      body,
      actorId: session.user.id!,
    });

    await logAudit({
      userId: session.user.id,
      churchId: followUp.churchId,
      action: "UPDATE",
      entityType: "MsdpFollowUp",
      entityId: id,
      details: { action: body.action },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
