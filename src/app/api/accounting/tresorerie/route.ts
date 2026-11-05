import { errorResponse, successResponse } from "@/lib/api-utils";
import { getDashboard } from "@/modules/treasury";
import { monthQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, queryOf } from "./_shared";

export async function GET(request: Request) {
  try {
    const { churchId } = await currentTreasury();
    const { month } = queryOf(request, monthQuerySchema);
    return successResponse(await getDashboard(churchId, month));
  } catch (error) {
    return errorResponse(error);
  }
}
