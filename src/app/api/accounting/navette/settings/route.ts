import { errorResponse, successResponse } from "@/lib/api-utils";
import { getShuttleSettings, updateLowBalanceThreshold } from "@/modules/shuttle";
import { settingsInputSchema } from "@/modules/shuttle/schemas";
import { currentChurchAccess } from "../_shared";

export async function GET() {
  try {
    const { churchId } = await currentChurchAccess(true);
    return successResponse(await getShuttleSettings(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, session } = await currentChurchAccess(true);
    const { lowBalanceThreshold } = settingsInputSchema.parse(await request.json());
    return successResponse(await updateLowBalanceThreshold(churchId, lowBalanceThreshold, session.user.id!));
  } catch (error) {
    return errorResponse(error);
  }
}
