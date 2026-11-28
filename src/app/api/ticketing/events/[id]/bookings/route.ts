import { successResponse, errorResponse } from "@/lib/api-utils";
import { listBookings } from "@/modules/ticketing";
import { canDo, requireEventAction } from "@/modules/ticketing/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { access } = await requireEventAction(id, "bookings");
    return successResponse(await listBookings(id, canDo(access, "payments")));
  } catch (error) {
    return errorResponse(error);
  }
}
