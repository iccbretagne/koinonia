import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { cancelReimbursement, requestReimbursement } from "@/modules/shuttle";
import { actorOf, entryAccess } from "../../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    requireRateLimit(request, { prefix: `shuttle:${access.session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await requestReimbursement(id, actorOf(access)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    await cancelReimbursement(id, actorOf(access));
    return successResponse({ cancelled: true });
  } catch (error) {
    return errorResponse(error);
  }
}
