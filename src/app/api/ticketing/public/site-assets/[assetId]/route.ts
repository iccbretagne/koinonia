import { errorResponse } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { readAsset } from "@/modules/ticketing";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    requireRateLimit(request, { prefix: `ticketing-site-asset:${getClientIp(request)}`, windowMs: 60_000, max: 300 });
    const { assetId } = await params;
    const asset = await readAsset(assetId, { publishedOnly: true });
    if (!asset) return Response.json({ error: "Introuvable" }, { status: 404 });
    return new Response(new Uint8Array(asset.buffer), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
