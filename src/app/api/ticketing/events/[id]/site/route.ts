import { successResponse, errorResponse } from "@/lib/api-utils";
import { getSite, saveDraft, setAfterCloseDays } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { afterCloseSchema, siteDocumentSchema } from "./contract";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEventAction(id, "site");
    return successResponse(await getSite(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "site");
    const doc = siteDocumentSchema.parse(await request.json());
    return successResponse(await saveDraft(id, session.user.id, doc));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "site");
    const { afterCloseDays } = afterCloseSchema.parse(await request.json());
    return successResponse(await setAfterCloseDays(id, session.user.id, afterCloseDays));
  } catch (error) {
    return errorResponse(error);
  }
}
