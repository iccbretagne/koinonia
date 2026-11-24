import { ApiError, successResponse, errorResponse } from "@/lib/api-utils";
import { addTicketImage, listTicketImages } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { imageNameSchema } from "./contract";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try { const { id } = await params; await requireEventAction(id, "read"); return successResponse(await listTicketImages(id)); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    if (Number(request.headers.get("content-length")) > 8 * 1024 * 1024 + 16_384) throw new ApiError(413, "Image trop lourde (8 Mo au plus)");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 8 * 1024 * 1024) throw new ApiError(400, "Choisissez une image de 8 Mo au plus");
    const name = imageNameSchema.parse(form.get("name") ?? file.name.slice(0, 120));
    return successResponse(await addTicketImage(id, session.user.id, Buffer.from(await file.arrayBuffer()), name));
  } catch (error) { return errorResponse(error); }
}
