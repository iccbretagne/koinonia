import { errorResponse, successResponse } from "@/lib/api-utils";
import { deleteCategory, getCategoryChurchId, updateCategory } from "@/modules/treasury";
import { categoryPatchSchema } from "@/modules/treasury/schemas";
import { limitMutation, treasuryOf } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getCategoryChurchId(id), "Catégorie introuvable");
    limitMutation(request, session.user.id!);
    return successResponse(await updateCategory(id, categoryPatchSchema.parse(await request.json()), actor));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getCategoryChurchId(id), "Catégorie introuvable");
    limitMutation(request, session.user.id!);
    await deleteCategory(id, actor);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
