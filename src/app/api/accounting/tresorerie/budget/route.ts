import { errorResponse, successResponse } from "@/lib/api-utils";
import { budgetVsActual, getBudget, setBudget } from "@/modules/treasury";
import { budgetInputSchema, yearQuerySchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation, queryOf } from "../_shared";

export async function GET(request: Request) {
  try {
    const { churchId } = await currentTreasury();
    const now = new Date();
    const year = queryOf(request, yearQuerySchema).year ?? now.getUTCFullYear();
    const month = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
    const [budget, comparison] = await Promise.all([getBudget(churchId, year), budgetVsActual(churchId, year, month)]);
    return successResponse({ year, month, budget, comparison });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const input = budgetInputSchema.parse(await request.json());
    return successResponse(await setBudget(churchId, input, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
