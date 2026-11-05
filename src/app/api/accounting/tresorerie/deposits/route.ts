import { errorResponse, successResponse } from "@/lib/api-utils";
import { createDeposit } from "@/modules/treasury";
import { depositInputSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const input = depositInputSchema.parse(await request.json());
    return successResponse(await createDeposit(churchId, input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
