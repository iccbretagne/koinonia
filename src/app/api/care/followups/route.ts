import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import {
  hasFollowupManagementAccess,
  canStartFollowUp,
  listMsdpFollowUps,
  startMsdpFollowUpFromIntegrationRequest,
} from "@/modules/care";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    const session = await requireAuth();
    const hasFullAccess = await hasFollowupManagementAccess(session, churchId);

    let followUps = await listMsdpFollowUps(churchId);
    if (!hasFullAccess) {
      followUps = followUps.filter((f) => f.assignedConseillerMsdpId === session.user.id);
      if (followUps.length === 0) throw new Error("FORBIDDEN");
    }

    return successResponse(followUps);
  } catch (error) {
    return errorResponse(error);
  }
}

const startSchema = z.object({
  churchId: z.string().min(1),
  integrationRequestId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const data = startSchema.parse(await request.json());
    const session = await requireAuth();

    if (!(await canStartFollowUp(session, data.churchId)))
      throw new ApiError(403, "Seule l'équipe intégration ou MSDP peut créer un suivi MSDP");

    const followUp = await startMsdpFollowUpFromIntegrationRequest({
      integrationRequestId: data.integrationRequestId,
      churchId: data.churchId,
    });

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "MsdpFollowUp",
      entityId: followUp.id,
      details: { requestId: data.integrationRequestId },
    });

    return successResponse(followUp, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
