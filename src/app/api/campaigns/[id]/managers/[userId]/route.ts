import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { requireCampaignManager, userActor } from "@/modules/campaigns/auth";
import { removeManager } from "@/modules/campaigns";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, userId } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    requireRateLimit(request, { prefix: `campaigns:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await removeManager(campaign.id, userId, { userId: session.user.id, name: userActor(session).name }));
  } catch (error) {
    return errorResponse(error);
  }
}
