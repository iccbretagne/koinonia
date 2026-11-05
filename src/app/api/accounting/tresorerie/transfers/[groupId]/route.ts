import { errorResponse, successResponse } from "@/lib/api-utils";
import { getTransferChurchId, updateTransfer } from "@/modules/treasury";
import { transferInputSchema } from "@/modules/treasury/schemas";
import { limitMutation, treasuryOf } from "../../_shared";

export async function PATCH(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const { session, actor } = await treasuryOf(await getTransferChurchId(groupId), "Transfert introuvable");
    limitMutation(request, session.user.id!);
    const input = transferInputSchema.parse(await request.json());
    return successResponse(await updateTransfer(groupId, input, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
