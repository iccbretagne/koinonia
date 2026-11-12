/** GET/PUT /api/mcp/settings — interrupteur d'instance et activité (spec 081, Super Admin). */
import { requireSuperAdmin } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getMcpInstanceSettings, mcpUsageStats, setMcpInstanceEnabled } from "@/modules/mcp";
import { instanceSettingsSchema } from "./contract";

export async function GET() {
  try {
    await requireSuperAdmin();
    const [settings, usage] = await Promise.all([getMcpInstanceSettings(), mcpUsageStats()]);
    return successResponse({ enabled: settings.enabled, usage });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const data = instanceSettingsSchema.parse(await request.json());
    const session = await requireSuperAdmin();
    await setMcpInstanceEnabled(data.enabled, session.user.id);
    return successResponse({ enabled: data.enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
