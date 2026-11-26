import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentManager } from "@/modules/campaigns/auth";
import { addRespondent, listRespondents } from "@/modules/campaigns";
import { limitMutation, readJson } from "../../_shared";
import { respondentAddSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentManager(id);
    return successResponse(await listRespondents(access));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentManager(id);
    limitMutation(request, access);
    const input = respondentAddSchema.parse(await readJson(request));
    return successResponse(await addRespondent(access, input), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
