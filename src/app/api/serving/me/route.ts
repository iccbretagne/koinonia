import { errorResponse, successResponse } from "@/lib/api-utils";
import { getOwnApplication } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import { meQuery } from "./contract";

export async function GET(request: Request) {
  try {
    const { churchId } = meQuery.parse({ churchId: new URL(request.url).searchParams.get("churchId") ?? "" });
    const actor = await requireServingActor(churchId);
    return successResponse(await getOwnApplication(actor.userId, churchId));
  } catch (error) {
    return errorResponse(error);
  }
}
