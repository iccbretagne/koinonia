import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { findResponseByToken, respondToOffer } from "@/modules/forms";
import { readJson } from "../../../../_shared";
import { offerSchema } from "./contract";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    requireRateLimit(request, { prefix: `forms-manage:${getClientIp(request)}`, windowMs: 60_000, max: 30 });
    const { token } = await params;
    const response = await findResponseByToken(token);
    if (!response) throw new ApiError(404, "Ce lien ne mène à aucune réponse.");
    const { accept } = offerSchema.parse(await readJson(request));
    const updated = await respondToOffer(response.id, accept);
    return successResponse({ status: updated.status });
  } catch (error) {
    return errorResponse(error);
  }
}
