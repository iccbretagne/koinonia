import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormAccess, scopeWhere } from "@/modules/forms/auth";
import { formResults } from "@/modules/forms";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireFormAccess(id);
    const { responses, questions, participation } = await formResults(id, scopeWhere(access));
    return successResponse({ responses, questions, participation });
  } catch (error) {
    return errorResponse(error);
  }
}
