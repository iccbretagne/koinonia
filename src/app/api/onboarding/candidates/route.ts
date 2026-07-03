import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { findUnlinkedMembersByEmail } from "@/lib/onboarding";

/**
 * GET /api/onboarding/candidates — réconciliation par email (P2).
 * Retourne les fiches STAR non liées dont l'email correspond à l'email vérifié
 * du compte du demandeur. Ne renvoie QUE les fiches de cet email.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const email = session.user.email;
    const candidates = email ? await findUnlinkedMembersByEmail(email) : [];
    return successResponse({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}
