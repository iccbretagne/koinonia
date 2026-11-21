import { successResponse, errorResponse } from "@/lib/api-utils";
import { getSite, getDomain, requestDomain, removeDomain } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { requestDomainSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEventAction(id, "configure");
    return successResponse(await getDomain(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const { host } = requestDomainSchema.parse(await request.json());
    await getSite(id);
    return successResponse(await requestDomain(id, session.user.id, host), 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    await removeDomain(id, session.user.id);
    return successResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
