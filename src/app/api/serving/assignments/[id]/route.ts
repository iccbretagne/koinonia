import { resolveChurchId } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { attachMemberToDepartment, detachMemberFromDepartment } from "@/modules/planning";
import { acceptAssignment, confirmAssignment, sendBackAssignment } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";
import { assignmentActionSchema } from "./contract";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireServingActor(await resolveChurchId("servingAssignment", id));
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const body = assignmentActionSchema.parse(await request.json());
    let applicationId: string;
    if (body.action === "accept") {
      applicationId = await acceptAssignment(actor, id, (m, d, c) => attachMemberToDepartment(m, d, c));
    } else if (body.action === "confirm") {
      applicationId = await confirmAssignment(actor, id);
    } else {
      applicationId = await sendBackAssignment(actor, id, body.reason, (m, d, c) => detachMemberFromDepartment(m, d, c));
    }
    return successResponse({ applicationId });
  } catch (error) {
    return errorResponse(error);
  }
}
