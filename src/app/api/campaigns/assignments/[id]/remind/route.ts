import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { remindAssignment } from "@/modules/campaigns";
import { limitMutation } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    return successResponse(await remindAssignment(access.assignment.id));
  } catch (error) {
    return errorResponse(error);
  }
}
