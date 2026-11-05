import { errorResponse, successResponse } from "@/lib/api-utils";
import { getReports } from "@/modules/treasury";
import { periodQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, queryOf } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId } = await currentTreasury();
    const { from, to } = queryOf(request, periodQuerySchema);
    return successResponse(await getReports(churchId, from, to));
  } catch (error) {
    return errorResponse(error);
  }
}
