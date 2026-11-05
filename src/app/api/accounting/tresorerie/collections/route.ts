import { errorResponse, successResponse } from "@/lib/api-utils";
import { createCollection, listCollectionServices } from "@/modules/treasury";
import { collectionInputSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentTreasury();
    return successResponse(await listCollectionServices(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const input = collectionInputSchema.parse(await request.json());
    return successResponse(await createCollection(churchId, input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
