import { successResponse, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { exportCampaignDefinition } from "@/modules/campaigns";
import { definitionQuerySchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    const query = definitionQuerySchema.parse({ download: new URL(request.url).searchParams.get("download") ?? undefined });
    const { definition } = await exportCampaignDefinition(campaign.id);
    await logAudit({
      userId: session.user.id,
      churchId: campaign.churchId,
      action: "EXPORT",
      entityType: "Campaign",
      entityId: campaign.id,
      details: { format: "definition" },
    });
    if (query.download !== "1") return successResponse(definition);
    return new Response(`${JSON.stringify(definition, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${campaign.key}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
