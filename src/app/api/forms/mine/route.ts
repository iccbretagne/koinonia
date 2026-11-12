import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listMemberResponses } from "@/modules/forms";

export async function GET() {
  try {
    const session = await requireAuth();
    return successResponse(await listMemberResponses(session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
