import { errorResponse, successResponse } from "@/lib/api-utils";
import { getInstanceSettings, setInstanceEnabled } from "@/modules/assistant";
import { instanceSettingsSchema } from "@/modules/assistant/schemas";
import { assistantAdmin } from "../_shared";

export async function GET() {
  try {
    await assistantAdmin();
    return successResponse(await getInstanceSettings());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { actor } = await assistantAdmin();
    const { enabled } = instanceSettingsSchema.parse(await request.json());
    return successResponse(await setInstanceEnabled(enabled, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
