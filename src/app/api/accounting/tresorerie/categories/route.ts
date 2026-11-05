import { errorResponse, successResponse } from "@/lib/api-utils";
import { createCategory, listCategories } from "@/modules/treasury";
import { categoryInputSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentTreasury();
    return successResponse(await listCategories(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const input = categoryInputSchema.parse(await request.json());
    return successResponse(await createCategory(churchId, input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
