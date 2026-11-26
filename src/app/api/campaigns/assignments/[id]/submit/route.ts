import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess } from "@/modules/campaigns/auth";
import { submitAssignment } from "@/modules/campaigns";
import { limitMutation } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentAccess(id);
    limitMutation(request, access);
    return successResponse(await submitAssignment(access));
  } catch (error) {
    return errorResponse(error);
  }
}
