import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { createBooking, getPublicEvent } from "@/modules/ticketing";
import { readJson } from "../../../../_shared";
import { bookingCreateSchema } from "./contract";

type Params = { params: Promise<{ churchSlug: string; eventSlug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `ticketing-book:${ip}`, windowMs: 60_000, max: 5 });
    const { churchSlug, eventSlug } = await params;
    const data = bookingCreateSchema.parse(await readJson(request));
    if (!(await verifyTurnstile(data.turnstileToken ?? "", ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");
    }
    const event = await getPublicEvent(churchSlug, eventSlug);
    if (!event) throw new ApiError(404, "Événement introuvable");
    const booking = await createBooking(event.id, data);
    return successResponse({ reference: booking.reference, manageToken: booking.manageToken }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
