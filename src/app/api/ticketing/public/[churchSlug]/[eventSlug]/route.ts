import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPublicEvent } from "@/modules/ticketing";

type Params = { params: Promise<{ churchSlug: string; eventSlug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    requireRateLimit(request, { prefix: `ticketing-event:${getClientIp(request)}`, windowMs: 60_000, max: 60 });
    const { churchSlug, eventSlug } = await params;
    const event = await getPublicEvent(churchSlug, eventSlug);
    if (!event) throw new ApiError(404, "Événement introuvable");
    return successResponse(event);
  } catch (error) {
    return errorResponse(error);
  }
}
