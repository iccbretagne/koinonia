import { resolveChurchId } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { bookSlot, cancelInterview, getApplication, inviteToBook, recordOutcome } from "@/modules/serving";
import { requireServingManage } from "@/modules/serving/auth";
import { pvsInterviewActionSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("servingApplication", id);
    const actor = await requireServingManage(churchId);
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const body = pvsInterviewActionSchema.parse(await request.json());
    if (body.action === "book") await bookSlot(id, body.slotId, { byCandidate: false });
    else if (body.action === "cancel") await cancelInterview(id, "PVS", { required: true });
    else if (body.action === "outcome") await recordOutcome(id, body.status, actor.userId);
    else await inviteToBook(id);
    await logAudit({
      userId: actor.userId,
      churchId,
      action: "UPDATE",
      entityType: "ServingInterview",
      entityId: id,
      details: { action: body.action, ...(body.action === "outcome" ? { status: body.status } : {}) },
    });
    return successResponse(await getApplication(actor, id));
  } catch (error) {
    return errorResponse(error);
  }
}
