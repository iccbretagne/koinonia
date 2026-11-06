import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { listMyBookings } from "@/modules/ticketing";

export async function GET() {
  try {
    const session = await requireAuth();
    return successResponse({ bookings: await listMyBookings(session.user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
