import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { campaignReadiness } from "@/modules/campaigns";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { campaign } = await requireCampaignManager(id);
    return successResponse(await campaignReadiness(campaign.id));
  } catch (error) {
    return errorResponse(error);
  }
}
