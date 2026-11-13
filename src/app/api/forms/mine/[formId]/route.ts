import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { answersRecord, cancelResponse, findMemberResponse, updateOwnResponse } from "@/modules/forms";
import { answersSchema } from "./contract";

type Params = { params: Promise<{ formId: string }> };

async function own(params: Params["params"]) {
  const session = await requireAuth();
  const { formId } = await params;
  const response = await findMemberResponse(formId, session.user.id);
  if (!response) throw new ApiError(404, "Aucune réponse de votre part à ce formulaire");
  return response;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const response = await own(params);
    return successResponse({ status: response.status, answers: answersRecord(response.answers) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const response = await own(params);
    const { answers } = answersSchema.parse(await request.json());
    const updated = await updateOwnResponse(response.id, answers);
    return successResponse({ status: updated.status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const response = await own(params);
    const cancelled = await cancelResponse(response.id);
    return successResponse({ status: cancelled.status });
  } catch (error) {
    return errorResponse(error);
  }
}
