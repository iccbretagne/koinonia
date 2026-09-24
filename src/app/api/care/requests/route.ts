import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import {
  getCareAccess,
  appointmentSubmitSchema,
  submitAppointmentRequest,
  listAppointmentRequests,
  resolveRequestReaderAccess,
  projectRequest,
} from "@/modules/care";
import type { AppointmentRequestStatus } from "@/generated/prisma/client";

const ALLOWED_STATUSES = ["PENDING", "VALIDATED", "SCHEDULED", "CLOSED", "REJECTED"] as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const statusRaw = searchParams.get("status");
    if (statusRaw !== null && !(ALLOWED_STATUSES as readonly string[]).includes(statusRaw)) {
      throw new ApiError(400, `Statut invalide. Valeurs acceptées : ${ALLOWED_STATUSES.join(", ")}`);
    }

    const session = await requireAuth();
    const access = await getCareAccess(session, churchId);
    if (!access.canOverview && access.ownProfileIds.length === 0) throw new Error("FORBIDDEN");

    const statuses: AppointmentRequestStatus[] = statusRaw
      ? [statusRaw as AppointmentRequestStatus]
      : [...ALLOWED_STATUSES];

    let requests = await listAppointmentRequests(churchId, statuses);

    // Accompagnant sans vue d'ensemble : uniquement les demandes dont il est en charge.
    if (!access.canOverview) {
      requests = requests.filter(
        (r) => r.assignedTo && access.ownProfileIds.includes(r.assignedTo.id)
      );
    }

    const projected = requests.map((r) =>
      projectRequest(
        r,
        resolveRequestReaderAccess({
          canQualify: access.canQualify,
          currentUserId: access.userId,
          assignedToUserId: r.assignedTo?.userId ?? null,
        })
      )
    );

    return successResponse(projected);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = appointmentSubmitSchema.parse(body);

    const session = await requireChurchPermission("planning:view", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const created = await submitAppointmentRequest(data, session.user.id!);

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "AppointmentRequest",
      entityId: created.id,
      details: { subject: data.subject },
    });

    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
