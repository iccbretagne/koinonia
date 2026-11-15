import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { getClientIp, requireRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { logger } from "@/lib/logger";
import { resendInterviewLink, resolvePublicChurch } from "@/modules/serving";
import { interviewRecoverSchema } from "./contract";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `serving-interview-recover:${ip}`, windowMs: 60_000, max: 3 });
    const { churchSlug, email, turnstileToken } = interviewRecoverSchema.parse(await request.json().catch(() => ({})));
    if (!turnstileToken || !(await verifyTurnstile(turnstileToken, ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Recharge la page et réessaie.");
    }
    const church = await resolvePublicChurch(churchSlug);
    // Même réponse dans tous les cas : rien n'indique si l'adresse est connue.
    if (church) await resendInterviewLink(church.id, email).catch((err) => logger.error({ err }, "Renvoi du lien de rendez-vous échoué"));
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
