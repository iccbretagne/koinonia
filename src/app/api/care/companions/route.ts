import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireCareQualify, listMsdpCounselors } from "@/modules/care";

/** Vivier d'accompagnants assignables — membres du MSDP à ce stade (lot 1). Les profils
 *  pastoraux s'y ajoutent au lot 2 (`assignee.ts`). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireCareQualify(churchId);

    const msdpMembers = await listMsdpCounselors(churchId);
    return successResponse({ msdpMembers });
  } catch (error) {
    return errorResponse(error);
  }
}
