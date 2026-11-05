import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireChurchPermission } from "@/lib/auth";
import { getChurchSetting, setChurchDisabled } from "@/modules/assistant";
import { churchSettingSchema } from "@/modules/assistant/schemas";

type Params = { params: Promise<{ churchId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("church:settings", churchId);
    return successResponse(await getChurchSetting(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    const session = await requireChurchPermission("church:settings", churchId);
    const { disabled } = churchSettingSchema.parse(await request.json());
    return successResponse(await setChurchDisabled(churchId, disabled, { id: session.user.id! }));
  } catch (error) {
    return errorResponse(error);
  }
}
