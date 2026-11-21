import { errorResponse, ApiError } from "@/lib/api-utils";
import { getSite, readAsset } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

type Params = { params: Promise<{ id: string; assetId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id, assetId } = await params;
    await requireEventAction(id, "site");
    const site = await getSite(id);
    const w = Number(new URL(request.url).searchParams.get("w"));
    const asset = await readAsset(assetId, { publishedOnly: false, siteId: site.id }, Number.isInteger(w) && w > 0 ? w : undefined);
    if (!asset) throw new ApiError(404, "Image introuvable");
    return new Response(new Uint8Array(asset.buffer), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
