import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormAccess, scopeWhere } from "@/modules/forms/auth";
import { listResponses } from "@/modules/forms";
import { responsesQuerySchema } from "@/modules/forms/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await requireFormAccess(id);
    const { status, sessionId, levelId } = responsesQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const filter = { ...(sessionId ? { sessionId } : {}), ...(levelId ? { levelId } : {}) };
    const responses = await listResponses(id, status, { AND: [filter, scopeWhere(access)] });
    // Un intervenant voit les noms et les réponses de son périmètre, jamais les coordonnées.
    if (access.kind === "facilitator") {
      return successResponse(responses.map((r) => ({ ...r, contactEmail: null, user: r.user ? { ...r.user, email: null } : null })));
    }
    return successResponse(responses);
  } catch (error) {
    return errorResponse(error);
  }
}
