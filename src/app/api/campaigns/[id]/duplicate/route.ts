import { ApiError, successResponse, errorResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { hasCampaignsManage, requireCampaignManager, userActor } from "@/modules/campaigns/auth";
import { duplicateCampaign } from "@/modules/campaigns";
import { duplicateCampaignSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    // Créer une campagne reste réservé à `campaigns:manage` : un gestionnaire désigné ne duplique pas.
    if (!(await hasCampaignsManage(session, campaign.churchId))) throw new ApiError(403, "Accès refusé");
    requireRateLimit(request, { prefix: `campaigns:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const input = duplicateCampaignSchema.parse(await request.json());
    const created = await duplicateCampaign(campaign.id, input, { userId: session.user.id, name: userActor(session).name }, campaign.churchId);
    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
