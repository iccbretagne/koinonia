import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { saveAnswers } from "@/modules/campaigns";
import { limitPublic, readJson } from "../../../assignments/_shared";
import { answersBodySchema } from "./contract";

type Params = { params: Promise<{ token: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    limitPublic(request, "answers");
    const { token } = await params;
    const access = await requireTokenAccess(token);
    const { answers } = answersBodySchema.parse(await readJson(request));
    return successResponse(await saveAnswers(access, answers));
  } catch (error) {
    return errorResponse(error);
  }
}
