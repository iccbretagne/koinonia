import { successResponse, errorResponse } from "@/lib/api-utils";
import { markRefunded } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { refundSchema } from "./contract";

type Params = { params: Promise<{ id: string; bookingId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const { session } = await requireEventAction(id, "payments");
    const data = refundSchema.parse(await request.json());
    return successResponse(await markRefunded(id, bookingId, data, session.user.id), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
