import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { candidatesQuerySchema } from "@/modules/campaigns/schemas";
import { searchCandidates } from "@/modules/campaigns";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { campaign } = await requireCampaignManager(id);
    const { q } = candidatesQuerySchema.parse({ q: new URL(request.url).searchParams.get("q") ?? undefined });
    return successResponse(await searchCandidates(campaign.churchId, q));
  } catch (error) {
    return errorResponse(error);
  }
}
