import { ApiError, successResponse, errorResponse } from "@/lib/api-utils";
import { readTicketImage, deleteTicketImage } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
type Params = { params: Promise<{ id: string; imageId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, imageId } = await params; await requireEventAction(id, "read");
    const image = await readTicketImage(id, imageId);
    if (!image) throw new ApiError(404, "Image introuvable");
    return new Response(new Uint8Array(image.data), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(_request: Request, { params }: Params) {
  try { const { id, imageId } = await params; const { session } = await requireEventAction(id, "configure"); await deleteTicketImage(id, session.user.id, imageId); return successResponse({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
