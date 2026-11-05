import { errorResponse, successResponse } from "@/lib/api-utils";
import { createPurpose, listPurposes } from "@/modules/treasury";
import { purposeInputSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentTreasury();
    return successResponse(await listPurposes(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const { name } = purposeInputSchema.parse(await request.json());
    return successResponse(await createPurpose(churchId, name, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
