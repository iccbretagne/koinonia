import { resolveChurchId } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { assignApplication, getApplication } from "@/modules/serving";
import { requireServingManage } from "@/modules/serving/auth";
import { assignSchema } from "./contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireServingManage(await resolveChurchId("servingApplication", id));
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const { departmentIds } = assignSchema.parse(await request.json());
    await assignApplication(actor, id, departmentIds);
    return successResponse(await getApplication(actor, id), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
