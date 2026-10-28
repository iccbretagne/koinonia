import { errorResponse, successResponse } from "@/lib/api-utils";
import { listApplications } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import { listQuery } from "./contract";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { churchId, view } = listQuery.parse({
      churchId: searchParams.get("churchId") ?? "",
      view: searchParams.get("view") ?? undefined,
    });
    const actor = await requireServingActor(churchId);
    return successResponse(await listApplications(actor, view));
  } catch (error) {
    return errorResponse(error);
  }
}
