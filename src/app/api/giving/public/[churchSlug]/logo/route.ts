import { Readable } from "node:stream";
import { ApiError, errorResponse } from "@/lib/api-utils";
import { getPublicGivingLogoStream } from "@/modules/giving";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ churchSlug: string }> }
) {
  try {
    const { churchSlug } = await params;
    const stream = await getPublicGivingLogoStream(churchSlug);
    if (!stream) throw new ApiError(404, "Logo introuvable");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
