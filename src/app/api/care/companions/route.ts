import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  requireCareQualify,
  listAssignableProfiles,
  listEligibleCompanions,
  setCompanionState,
} from "@/modules/care";
import { putSchema } from "./contract";

/**
 * Vivier d'accompagnants assignables (spec 052, T48 ; spec 056) : deux groupes — profils
 * pastoraux (`userId: null` = sans compte, prévenu par email seulement) et STAR accompagnants
 * (`members`, vivier calculé du MSDP + exceptions déclarées, `listEligibleCompanions`).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireCareQualify(churchId);

    const [profiles, members] = await Promise.all([
      listAssignableProfiles(churchId),
      listEligibleCompanions(churchId),
    ]);

    return successResponse({ profiles, members });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Déclare une exception au vivier calculé (spec 056) : ajoute un STAR hors MSDP, exclut un
 * membre du MSDP, ou revient au calcul par défaut.
 */
export async function PUT(request: Request) {
  try {
    const { churchId, userId, state } = putSchema.parse(await request.json());
    const session = await requireCareQualify(churchId);

    const result = await setCompanionState({ churchId, userId, state, actorId: session.user.id! });

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
