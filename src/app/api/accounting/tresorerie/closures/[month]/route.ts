import { errorResponse, successResponse } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { reopenMonth } from "@/modules/treasury";
import { isoMonth, reopenSchema } from "@/modules/treasury/schemas";
import { limitMutation, treasuryOf } from "../../_shared";

export async function DELETE(request: Request, { params }: { params: Promise<{ month: string }> }) {
  try {
    const { month } = await params;
    const session = await requireAuth();
    const { churchId, actor } = await treasuryOf((await getCurrentChurchId(session)) ?? null, "Aucune église sélectionnée", true);
    limitMutation(request, session.user.id!);
    const { reason } = reopenSchema.parse(await request.json());
    await reopenMonth(churchId, isoMonth.parse(month), reason, actor);
    return successResponse({ reopened: true });
  } catch (error) {
    return errorResponse(error);
  }
}
