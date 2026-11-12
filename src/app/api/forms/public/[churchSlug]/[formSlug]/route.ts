import { auth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";
import { isChurchMember } from "@/modules/forms/auth";
import { UNAVAILABLE, answersRecord, findMemberResponse, hasAnonymousReceipt, loadAnswerableForm, publicView } from "@/modules/forms";

type Params = { params: Promise<{ churchSlug: string; formSlug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    requireRateLimit(request, { prefix: `forms-view:${getClientIp(request)}`, windowMs: 60_000, max: 60 });
    const { churchSlug, formSlug } = await params;
    const form = await loadAnswerableForm(churchSlug, formSlug);
    if (!form) throw new ApiError(404, UNAVAILABLE);
    const session = await auth();
    if (form.access === "MEMBERS") {
      if (!session?.user) throw new ApiError(401, "Connectez-vous pour répondre à ce formulaire");
      if (!isChurchMember(session, form.churchId)) throw new ApiError(404, UNAVAILABLE);
    }
    const userId = session?.user?.id;
    let mine: { status: string; answers: Record<string, unknown> } | null = null;
    let alreadyAnswered = false;
    if (userId && form.anonymous) alreadyAnswered = await hasAnonymousReceipt(form.id, userId);
    else if (userId) {
      const own = await findMemberResponse(form.id, userId);
      if (own) mine = { status: own.status, answers: answersRecord(own.answers) };
    }
    return successResponse({ ...(await publicView(form)), signedIn: !!userId, mine, alreadyAnswered: alreadyAnswered || !!mine });
  } catch (error) {
    return errorResponse(error);
  }
}
