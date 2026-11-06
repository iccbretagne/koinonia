import { successResponse, errorResponse } from "@/lib/api-utils";
import { addVariant } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { variantCreateSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  try {
    const { id, optionId } = await params;
    const { session } = await requireEventAction(id, "menu");
    const data = variantCreateSchema.parse(await request.json());
    return successResponse(await addVariant(id, optionId, session.user.id, data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
