import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { listMyCampaigns } from "@/modules/campaigns";

export async function GET() {
  try {
    const session = await requireAuth();
    return successResponse(await listMyCampaigns(session));
  } catch (error) {
    return errorResponse(error);
  }
}
