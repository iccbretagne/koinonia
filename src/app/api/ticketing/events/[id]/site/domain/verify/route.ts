import { successResponse, errorResponse } from "@/lib/api-utils";
import { verifyDomain } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    return successResponse(await verifyDomain(id, session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
