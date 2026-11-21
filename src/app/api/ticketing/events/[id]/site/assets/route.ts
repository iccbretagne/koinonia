import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getSite, listAssets, uploadAsset } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireEventAction(id, "site");
    const site = await getSite(id);
    return successResponse(await listAssets(site.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "site");
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BYTES + 64 * 1024) throw new ApiError(413, "Image trop lourde (8 Mo au plus)");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Aucune image fournie");
    const alt = form.get("alt");
    const name = form.get("name");
    const site = await getSite(id);
    return successResponse(
      await uploadAsset(site.id, session.user.id, Buffer.from(await file.arrayBuffer()), {
        alt: typeof alt === "string" ? alt : "",
        name: typeof name === "string" && name.trim() ? name : file.name,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
