import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { requireCampaignManager, userActor } from "@/modules/campaigns/auth";
import { getCampaignOverview, updateCampaignSettings } from "@/modules/campaigns";
import { campaignSettingsSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { campaign } = await requireCampaignManager(id);
    return successResponse(await getCampaignOverview(campaign.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    requireRateLimit(request, { prefix: `campaigns:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const data = campaignSettingsSchema.parse(await request.json());
    return successResponse(await updateCampaignSettings(campaign.id, data, { userId: session.user.id, name: userActor(session).name }));
  } catch (error) {
    return errorResponse(error);
  }
}
