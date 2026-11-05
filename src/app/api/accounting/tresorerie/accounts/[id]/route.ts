import { errorResponse, successResponse } from "@/lib/api-utils";
import { getAccountChurchId, updateAccount } from "@/modules/treasury";
import { accountPatchSchema } from "@/modules/treasury/schemas";
import { limitMutation, treasuryOf } from "../../_shared";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getAccountChurchId(id), "Compte introuvable");
    limitMutation(request, session.user.id!);
    const patch = accountPatchSchema.parse(await request.json());
    return successResponse(await updateAccount(id, patch, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
