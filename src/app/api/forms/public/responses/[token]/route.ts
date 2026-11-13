import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { acceptsResponses, answersRecord, cancelResponse, findResponseByToken, publicView, updateOwnResponse } from "@/modules/forms";
import { readJson } from "../../../_shared";
import { answersSchema } from "./contract";

type Params = { params: Promise<{ token: string }> };

const NOT_FOUND = "Ce lien ne mène à aucune réponse.";

async function load(request: Request, params: Params["params"]) {
  requireRateLimit(request, { prefix: `forms-manage:${getClientIp(request)}`, windowMs: 60_000, max: 30 });
  const { token } = await params;
  const response = await findResponseByToken(token);
  if (!response) throw new ApiError(404, NOT_FOUND);
  return response;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const response = await load(request, params);
    return successResponse({
      form: await publicView(response.form),
      status: response.status,
      offerExpiresAt: response.offerExpiresAt,
      answers: answersRecord(response.answers),
      editable: acceptsResponses(response.form) && ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(response.status),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const response = await load(request, params);
    const { answers } = answersSchema.parse(await readJson(request));
    const updated = await updateOwnResponse(response.id, answers);
    return successResponse({ status: updated.status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const response = await load(request, params);
    const cancelled = await cancelResponse(response.id);
    return successResponse({ status: cancelled.status });
  } catch (error) {
    return errorResponse(error);
  }
}
