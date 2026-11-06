import { resolveChurchId } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getApplication, linkMember, rejectApplication } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import { applicationActionSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const actor = await requireServingActor(await resolveChurchId("servingApplication", id));
    return successResponse(await getApplication(actor, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const actor = await requireServingActor(await resolveChurchId("servingApplication", id));
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const body = applicationActionSchema.parse(await request.json());
    if (body.action === "reject") await rejectApplication(actor, id, body.reason);
    else await linkMember(actor, id, body.memberId);
    return successResponse(await getApplication(actor, id));
  } catch (error) {
    return errorResponse(error);
  }
}
