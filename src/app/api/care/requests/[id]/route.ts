import { requireAuth, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  getCareAccess,
  appointmentPatchSchema,
  getAppointmentRequestById,
  applyAppointmentTransition,
  resolveRequestReaderAccess,
  projectRequest,
} from "@/modules/care";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("appointmentRequest", id);
    const session = await requireAuth();
    const access = await getCareAccess(session, churchId);

    const item = await getAppointmentRequestById(id);
    if (!item || item.churchId !== churchId) throw new ApiError(404, "Demande introuvable");

    const readerAccess = resolveRequestReaderAccess({
      canQualify: access.canQualify,
      currentUserId: access.userId,
      assignedToUserId: item.assignedTo?.userId ?? null,
      assignedMemberId: item.assignedMemberId,
    });

    const isCurrentAssignee =
      item.assignedMemberId === access.userId || item.assignedTo?.userId === access.userId;
    if (!access.canOverview && !isCurrentAssignee) throw new Error("FORBIDDEN");

    return successResponse(projectRequest(item, readerAccess));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Actions validate/reject/reassign/set_date/outcome/handback (spec 052, lot 2) — le droit par
 * action est entièrement porté par la machine à états pure (`appointment-state.ts`) : pas de
 * garde supplémentaire ici au-delà de l'authentification.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("appointmentRequest", id);
    const session = await requireAuth();
    const access = await getCareAccess(session, churchId);

    const body = appointmentPatchSchema.parse(await request.json());

    const updated = await applyAppointmentTransition({
      id,
      churchId,
      body,
      actorId: session.user.id!,
      isReferent: access.canQualify,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
