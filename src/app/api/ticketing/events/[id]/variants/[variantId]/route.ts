import { successResponse, errorResponse } from "@/lib/api-utils";
import { deleteVariant, updateVariant } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { variantSchema } from "./contract";

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, variantId } = await params;
    const { session } = await requireEventAction(id, "menu");
    const data = variantSchema.parse(await request.json());
    return successResponse(await updateVariant(id, variantId, session.user.id, data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, variantId } = await params;
    const { session } = await requireEventAction(id, "menu");
    await deleteVariant(id, variantId, session.user.id);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
