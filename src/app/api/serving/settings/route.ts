import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getServingSettings, updateServingSettings } from "@/modules/serving";
import { requireServingSettingsAccess } from "@/modules/serving/auth";
import { settingsQuery, settingsSchema } from "./contract";

export async function GET(request: Request) {
  try {
    const { churchId } = settingsQuery.parse({ churchId: new URL(request.url).searchParams.get("churchId") ?? "" });
    const actor = await requireServingSettingsAccess(churchId);
    return successResponse(await getServingSettings(churchId, actor.pvsDeptIds));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = settingsSchema.parse(await request.json());
    const actor = await requireServingSettingsAccess(input.churchId);
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await updateServingSettings(input, actor.pvsDeptIds, actor.userId));
  } catch (error) {
    return errorResponse(error);
  }
}
