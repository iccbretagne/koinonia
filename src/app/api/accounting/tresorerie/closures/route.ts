import { errorResponse, successResponse } from "@/lib/api-utils";
import { closeMonth, listClosures, listReopenings } from "@/modules/treasury";
import { closeMonthSchema } from "@/modules/treasury/schemas";
import { currentTreasury, limitMutation } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentTreasury();
    const [closures, reopenings] = await Promise.all([listClosures(churchId), listReopenings(churchId)]);
    return successResponse({ closures, reopenings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const { month } = closeMonthSchema.parse(await request.json());
    await closeMonth(churchId, month, actor);
    return successResponse({ month }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
