import { errorResponse, successResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { deleteSlot, slotChurchId, updateSlot } from "@/modules/serving";
import { requireServingManage } from "@/modules/serving/auth";
import { updateSlotSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const churchId = await slotChurchId(id);
    const actor = await requireServingManage(churchId);
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const input = updateSlotSchema.parse(await request.json());
    await updateSlot(id, input);
    await logAudit({ userId: actor.userId, churchId, action: "UPDATE", entityType: "ServingInterviewSlot", entityId: id, details: { fields: Object.keys(input) } });
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const churchId = await slotChurchId(id);
    const actor = await requireServingManage(churchId);
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    await deleteSlot(id);
    await logAudit({ userId: actor.userId, churchId, action: "DELETE", entityType: "ServingInterviewSlot", entityId: id });
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
