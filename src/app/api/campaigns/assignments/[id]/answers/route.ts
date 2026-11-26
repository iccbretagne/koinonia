import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireAssignmentAccess } from "@/modules/campaigns/auth";
import { saveAnswers } from "@/modules/campaigns";
import { limitAutosave, readJson } from "../../_shared";
import { answersBodySchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireAssignmentAccess(id);
    limitAutosave(request, access);
    const { answers } = answersBodySchema.parse(await readJson(request));
    return successResponse(await saveAnswers(access, answers));
  } catch (error) {
    return errorResponse(error);
  }
}
