import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { exportQuerySchema } from "@/modules/campaigns/schemas";
import { exportCampaign } from "@/modules/campaigns";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, campaign } = await requireCampaignManager(id);
    const url = new URL(request.url);
    const query = exportQuerySchema.parse({ format: url.searchParams.get("format") ?? undefined, form: url.searchParams.get("form") ?? undefined });
    const { buffer, fileName, contentType } = await exportCampaign(campaign.id, { format: query.format, formKey: query.form });
    await logAudit({
      userId: session.user.id,
      churchId: campaign.churchId,
      action: "EXPORT",
      entityType: "Campaign",
      entityId: campaign.id,
      details: { format: query.format, ...(query.form ? { form: query.form } : {}) },
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
