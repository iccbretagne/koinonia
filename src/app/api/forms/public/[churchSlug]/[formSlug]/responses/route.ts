import { auth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { isChurchMember } from "@/modules/forms/auth";
import {
  UNAVAILABLE,
  loadAnswerableForm,
  resendManageLink,
  sendReceipt,
  submitResponse,
} from "@/modules/forms";
import { readJson } from "../../../../_shared";
import { publicAnswersSchema } from "./contract";

type Params = { params: Promise<{ churchSlug: string; formSlug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    requireRateLimit(request, { prefix: `forms-answer:${ip}`, windowMs: 60_000, max: 5 });
    const { churchSlug, formSlug } = await params;
    const data = publicAnswersSchema.parse(await readJson(request));
    const form = await loadAnswerableForm(churchSlug, formSlug);
    if (!form) throw new ApiError(404, UNAVAILABLE);

    const session = await auth();
    if (form.access === "MEMBERS") {
      if (!session?.user) throw new ApiError(401, "Connectez-vous pour répondre à ce formulaire");
      if (!isChurchMember(session, form.churchId)) throw new ApiError(404, UNAVAILABLE);
    } else if (!(await verifyTurnstile(data.turnstileToken ?? "", ip))) {
      throw new ApiError(400, "Vérification anti-robots échouée. Veuillez réessayer.");
    }
    const respondent = session?.user?.id && session.user.email ? { userId: session.user.id, email: session.user.email } : null;

    const result = await submitResponse(form.id, data.answers, respondent);
    if (result.kind === "duplicate") {
      if (!respondent && result.contactEmail) {
        if (result.manageToken) await resendManageLink(form, result.contactEmail, result.manageToken);
        throw new ApiError(409, "Une réponse existe déjà pour cette adresse : le lien pour la consulter ou la modifier vient de lui être envoyé par email.");
      }
      throw new ApiError(409, "Vous avez déjà répondu à ce formulaire : vous pouvez modifier votre réponse.");
    }
    await sendReceipt({
      form,
      responseId: result.responseId,
      status: result.status,
      userId: result.userId,
      contactEmail: result.contactEmail,
      manageToken: result.manageToken,
      answers: result.values,
    });
    return successResponse({ status: result.status, manageToken: result.manageToken }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

