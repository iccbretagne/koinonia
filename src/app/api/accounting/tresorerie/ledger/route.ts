import { errorResponse, successResponse } from "@/lib/api-utils";
import { getLedger } from "@/modules/treasury";
import { ledgerQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, queryOf } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId } = await currentTreasury();
    return successResponse(await getLedger(churchId, queryOf(request, ledgerQuerySchema)));
  } catch (error) {
    return errorResponse(error);
  }
}
