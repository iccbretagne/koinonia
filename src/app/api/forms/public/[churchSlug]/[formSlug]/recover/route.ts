import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { loadAnswerableForm, needsContact, recoverResponseLink, resendManageLink } from "@/modules/forms";
import { readJson } from "../../../../_shared";
import { recoverSchema } from "./contract";

type Params = { params: Promise<{ churchSlug: string; formSlug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `forms-recover:${ip}`, windowMs: 60_000, max: 3 });
    const { churchSlug, formSlug } = await params;
    const data = recoverSchema.parse(await readJson(request, 4096));
    if (!(await verifyTurnstile(data.turnstileToken ?? "", ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");
    }
    // Même réponse dans tous les cas : on ne révèle ni l'existence d'une réponse ni celle du formulaire.
    const form = await loadAnswerableForm(churchSlug, formSlug);
    if (form && needsContact(form)) {
      const found = await recoverResponseLink(form.id, data.email);
      if (found) await resendManageLink(form, found.contactEmail, found.manageToken);
    }
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
