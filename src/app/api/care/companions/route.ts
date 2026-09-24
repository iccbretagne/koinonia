import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireCareQualify, listMsdpCounselors, listAssignableProfiles } from "@/modules/care";

/**
 * Vivier d'accompagnants assignables (spec 052, T48) : deux groupes — profils pastoraux
 * (`userId: null` = sans compte, prévenu par email seulement) et membres du MSDP.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireCareQualify(churchId);

    const [profiles, msdpMembers] = await Promise.all([
      listAssignableProfiles(churchId),
      listMsdpCounselors(churchId),
    ]);

    return successResponse({ profiles, msdpMembers });
  } catch (error) {
    return errorResponse(error);
  }
}
