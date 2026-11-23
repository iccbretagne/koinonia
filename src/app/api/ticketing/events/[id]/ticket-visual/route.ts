import { successResponse, errorResponse } from "@/lib/api-utils";
import { getTicketVisual, saveTicketVisual, unpublishTicketVisual } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { saveSchema } from "./contract";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try { const { id } = await params; await requireEventAction(id, "read"); return successResponse(await getTicketVisual(id)); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const input = saveSchema.parse(await request.json());
    return successResponse(await saveTicketVisual(id, session.user.id, input.document, input.publish));
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(_request: Request, { params }: Params) {
  try { const { id } = await params; const { session } = await requireEventAction(id, "configure"); await unpublishTicketVisual(id, session.user.id); return successResponse({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
