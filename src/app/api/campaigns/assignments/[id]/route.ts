import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess, requireAssignmentManager } from "@/modules/campaigns/auth";
import { getAssignmentView, setAssignmentDueAt } from "@/modules/campaigns";
import { limitMutation, readJson } from "../_shared";
import { assignmentPatchSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentAccess(id);
    return successResponse(await getAssignmentView(access));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    const { dueAt } = assignmentPatchSchema.parse(await readJson(request));
    return successResponse(await setAssignmentDueAt(access, dueAt));
  } catch (error) {
    return errorResponse(error);
  }
}
