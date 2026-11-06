import { resolveChurchId } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { searchMembersChurchWide } from "@/modules/planning";
import { findMemberMatches } from "@/modules/serving";
import { requireServingManage } from "@/modules/serving/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireServingManage(await resolveChurchId("servingApplication", id));
    return successResponse(await findMemberMatches(actor, id, (churchId, q) => searchMembersChurchWide(churchId, q)));
  } catch (error) {
    return errorResponse(error);
  }
}
