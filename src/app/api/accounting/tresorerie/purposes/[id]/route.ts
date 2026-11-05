import { errorResponse, successResponse } from "@/lib/api-utils";
import { deletePurpose, getPurposeChurchId, updatePurpose } from "@/modules/treasury";
import { purposePatchSchema } from "@/modules/treasury/schemas";
import { limitMutation, treasuryOf } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getPurposeChurchId(id), "Objet introuvable");
    limitMutation(request, session.user.id!);
    return successResponse(await updatePurpose(id, purposePatchSchema.parse(await request.json()), actor));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getPurposeChurchId(id), "Objet introuvable");
    limitMutation(request, session.user.id!);
    await deletePurpose(id, actor);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
