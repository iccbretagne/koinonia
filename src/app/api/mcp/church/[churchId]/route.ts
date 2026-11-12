/** GET/PUT /api/mcp/church/[churchId] — réglage de l'église et liste des connexions (spec 081). */
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getMcpChurchEnabled, getMcpInstanceSettings, listChurchConnections, setMcpChurchEnabled } from "@/modules/mcp";
import { churchSettingsSchema } from "./contract";

type Params = { params: Promise<{ churchId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("church:settings", churchId);
    const [enabled, instance, connections] = await Promise.all([
      getMcpChurchEnabled(churchId),
      getMcpInstanceSettings(),
      listChurchConnections(churchId),
    ]);
    return successResponse({ enabled, instanceEnabled: instance.enabled, connections });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    const data = churchSettingsSchema.parse(await request.json());
    const session = await requireChurchPermission("church:settings", churchId);
    await setMcpChurchEnabled(churchId, data.enabled, session.user.id);
    return successResponse({ enabled: data.enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
