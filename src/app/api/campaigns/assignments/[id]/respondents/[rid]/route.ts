import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { removeRespondent } from "@/modules/campaigns";
import { limitMutation } from "../../../_shared";

type Params = { params: Promise<{ id: string; rid: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, rid } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    return successResponse(await removeRespondent(access, rid));
  } catch (error) {
    return errorResponse(error);
  }
}
