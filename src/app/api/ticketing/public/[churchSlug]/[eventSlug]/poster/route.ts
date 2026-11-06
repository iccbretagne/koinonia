import { errorResponse, ApiError } from "@/lib/api-utils";
import { getPublicEvent, readPoster } from "@/modules/ticketing";

type Params = { params: Promise<{ churchSlug: string; eventSlug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { churchSlug, eventSlug } = await params;
    const event = await getPublicEvent(churchSlug, eventSlug);
    const poster = event?.hasPoster ? await readPoster(event.id, true) : null;
    if (!poster) throw new ApiError(404, "Aucune affiche");
    return new Response(new Uint8Array(poster.buffer), { headers: { "Content-Type": poster.mime, "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return errorResponse(error);
  }
}
