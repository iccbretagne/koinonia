import { successResponse, errorResponse } from "@/lib/api-utils";
import { confirmPayment, rejectPayment } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { paymentActionSchema } from "./contract";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const { id, paymentId } = await params;
    const { session } = await requireEventAction(id, "payments");
    const data = paymentActionSchema.parse(await request.json());
    if (data.action === "confirm") await confirmPayment(id, paymentId, session.user.id);
    else await rejectPayment(id, paymentId, session.user.id, data.reason);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
