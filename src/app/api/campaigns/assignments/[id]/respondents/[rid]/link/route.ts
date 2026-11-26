import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { regenerateRespondentLink } from "@/modules/campaigns";
import { limitMutation } from "../../../../_shared";

type Params = { params: Promise<{ id: string; rid: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, rid } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    return successResponse(await regenerateRespondentLink(access, rid));
  } catch (error) {
    return errorResponse(error);
  }
}
