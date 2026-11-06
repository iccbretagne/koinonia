import { errorResponse, successResponse } from "@/lib/api-utils";
import { copyBudget } from "@/modules/treasury";
import { budgetCopySchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../../_shared";

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const { year, from } = budgetCopySchema.parse(await request.json());
    return successResponse(await copyBudget(churchId, year, from, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
