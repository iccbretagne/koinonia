import { requireSuperAdmin } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { approveDomain, rejectDomain } from "@/modules/ticketing";
import { decisionSchema } from "./contract";

type Params = { params: Promise<{ domainId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSuperAdmin();
    const { domainId } = await params;
    const { decision, reason } = decisionSchema.parse(await request.json());
    if (decision === "approve") await approveDomain(domainId, session.user.id);
    else await rejectDomain(domainId, session.user.id, reason);
    return successResponse({ decision });
  } catch (error) {
    return errorResponse(error);
  }
}
