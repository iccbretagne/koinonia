import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { requireCampaignManager, userActor } from "@/modules/campaigns/auth";
import { changeCampaignStatus } from "@/modules/campaigns";
import { campaignStatusSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    requireRateLimit(request, { prefix: `campaigns:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { action } = campaignStatusSchema.parse(await request.json());
    return successResponse(await changeCampaignStatus(campaign.id, action, { userId: session.user.id, name: userActor(session).name }));
  } catch (error) {
    return errorResponse(error);
  }
}
