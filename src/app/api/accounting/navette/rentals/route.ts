import { errorResponse, successResponse } from "@/lib/api-utils";
import { createRental, listRentals } from "@/modules/shuttle";
import { rentalInputSchema } from "@/modules/shuttle/schemas";
import { currentChurchAccess } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentChurchAccess();
    return successResponse(await listRentals(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { churchId, session } = await currentChurchAccess();
    const input = rentalInputSchema.parse(await request.json());
    return successResponse(await createRental(churchId, input, session.user.id!), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
