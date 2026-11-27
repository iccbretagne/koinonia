import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { replaceRespondent } from "@/modules/campaigns";
import { limitMutation, readJson } from "../../../../_shared";
import { respondentReplaceSchema } from "./contract";

type Params = { params: Promise<{ id: string; rid: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, rid } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    const input = respondentReplaceSchema.parse(await readJson(request));
    return successResponse(await replaceRespondent(access, rid, input));
  } catch (error) {
    return errorResponse(error);
  }
}
