import { successResponse, errorResponse } from "@/lib/api-utils";
import { getSite, publishSite, unpublishSite } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "site");
    await getSite(id);
    return successResponse(await publishSite(id, session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "site");
    await getSite(id);
    return successResponse(await unpublishSite(id, session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
