import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  getCareAccess,
  getItemChurchId,
  getCareHistory,
  getAppointmentRequestById,
  getMsdpFollowUpById,
} from "@/modules/care";

/** Frise d'historique (T43, T49) — référent, Admin/Super Admin, ou accompagnant en charge. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  try {
    const { kind, id } = await params;
    if (kind !== "requests" && kind !== "followups") throw new ApiError(400, "kind invalide");

    const churchId = await getItemChurchId(kind, id);
    if (!churchId) throw new ApiError(404, "Introuvable");

    const session = await requireAuth();
    const access = await getCareAccess(session, churchId);

    let isCurrentAssignee = false;
    if (!access.canOverview) {
      if (kind === "requests") {
        const item = await getAppointmentRequestById(id);
        isCurrentAssignee =
          item?.assignedMemberId === access.userId || item?.assignedTo?.userId === access.userId;
      } else {
        const item = await getMsdpFollowUpById(id);
        isCurrentAssignee =
          item?.assignedConseillerMsdpId === access.userId || item?.assignedProfile?.userId === access.userId;
      }
    }
    if (!access.canOverview && !isCurrentAssignee) throw new Error("FORBIDDEN");

    const history = await getCareHistory(kind, id);
    return successResponse(history);
  } catch (error) {
    return errorResponse(error);
  }
}
