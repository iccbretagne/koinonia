import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess } from "@/modules/campaigns/auth";
import { getAssignmentView } from "@/modules/campaigns";

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
