import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { getRentalChurchId, updateRental } from "@/modules/shuttle";
import { requireShuttleAccess } from "@/modules/shuttle/auth";
import { rentalInputSchema } from "@/modules/shuttle/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const churchId = await getRentalChurchId(id);
    if (!churchId) throw new ApiError(404, "Location introuvable");
    const { session } = await requireShuttleAccess(churchId);
    const input = rentalInputSchema.parse(await request.json());
    return successResponse(await updateRental(id, input, session.user.id!));
  } catch (error) {
    return errorResponse(error);
  }
}
