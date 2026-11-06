import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getPublicEvent, recoverBooking } from "@/modules/ticketing";
import { readJson } from "../../../../_shared";
import { recoverSchema } from "./contract";

type Params = { params: Promise<{ churchSlug: string; eventSlug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `ticketing-recover:${ip}`, windowMs: 60_000, max: 3 });
    const { churchSlug, eventSlug } = await params;
    const data = recoverSchema.parse(await readJson(request, 4096));
    if (!(await verifyTurnstile(data.turnstileToken ?? "", ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");
    }
    const event = await getPublicEvent(churchSlug, eventSlug);
    if (event) await recoverBooking(event.id, data.email);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
