import { successResponse, errorResponse } from "@/lib/api-utils";
import { deleteOption, updateOption } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { optionUpdateSchema } from "./contract";

type Params = { params: Promise<{ id: string; optionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, optionId } = await params;
    const { session } = await requireEventAction(id, "configure");
    const data = optionUpdateSchema.parse(await request.json());
    return successResponse(await updateOption(id, optionId, session.user.id, data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, optionId } = await params;
    const { session } = await requireEventAction(id, "configure");
    return successResponse(await deleteOption(id, optionId, session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
