import { errorResponse, successResponse } from "@/lib/api-utils";
import { listChequesInHand } from "@/modules/treasury";
import { chequesQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, queryOf } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId } = await currentTreasury();
    const { accountId } = queryOf(request, chequesQuerySchema);
    return successResponse(await listChequesInHand(churchId, accountId));
  } catch (error) {
    return errorResponse(error);
  }
}
