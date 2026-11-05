import { errorResponse, successResponse } from "@/lib/api-utils";
import { createTransfer } from "@/modules/treasury";
import { transferInputSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const input = transferInputSchema.parse(await request.json());
    return successResponse(await createTransfer(churchId, input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
