import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { findMemberResponse, respondToOffer } from "@/modules/forms";
import { offerSchema } from "./contract";

type Params = { params: Promise<{ formId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireAuth();
    const { formId } = await params;
    const response = await findMemberResponse(formId, session.user.id);
    if (!response) throw new ApiError(404, "Aucune réponse de votre part à ce formulaire");
    const { accept } = offerSchema.parse(await request.json());
    const updated = await respondToOffer(response.id, accept);
    return successResponse({ status: updated.status });
  } catch (error) {
    return errorResponse(error);
  }
}
