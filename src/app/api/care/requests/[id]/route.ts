import { requireAuth, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import {
  requireCareQualify,
  getCareAccess,
  appointmentPatchSchema,
  getAppointmentRequestById,
  validateAppointmentRequest,
  rejectAppointmentRequest,
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
    });

    if (!access.canOverview && !readerAccess.canReadContent) throw new Error("FORBIDDEN");

    return successResponse(projectRequest(item, readerAccess));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("appointmentRequest", id);
    const session = await requireCareQualify(churchId);

    const body = appointmentPatchSchema.parse(await request.json());

    if (body.action === "validate") {
      const updated = await validateAppointmentRequest({
        id,
        churchId,
        assignedToId: body.assignedToId,
        qualificationNote: body.qualificationNote ?? null,
        actorId: session.user.id!,
      });

      await logAudit({
        userId: session.user.id,
        churchId,
        action: "UPDATE",
        entityType: "AppointmentRequest",
        entityId: id,
        details: { transition: "PENDING→VALIDATED", assignedToId: body.assignedToId },
      });

      return successResponse(updated);
    }

    // reject
    const updated = await rejectAppointmentRequest({
      id,
      churchId,
      rejectReason: body.rejectReason ?? null,
      actorId: session.user.id!,
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AppointmentRequest",
      entityId: id,
      details: { transition: "PENDING→REJECTED", rejectReason: body.rejectReason ?? null },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
