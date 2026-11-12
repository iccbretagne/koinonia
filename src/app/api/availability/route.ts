import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listMemberAvailability } from "@/modules/planning";
import { monthSchema, putSchema } from "./contract";
import { answerFor, resolveAvailabilityTarget } from "./_core";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    const monthParam = searchParams.get("month");
    const month = monthParam
      ? new Date(`${monthSchema.parse(monthParam)}-01T00:00:00.000Z`)
      : new Date();

    const session = await requireAuth();
    const target = await resolveAvailabilityTarget(session, churchId, searchParams.get("memberId"), (permission) =>
      requireChurchPermission(permission, churchId)
    );
    const data = await listMemberAvailability(target.memberId, churchId, month);
    return successResponse({ memberId: target.memberId, isSelf: target.isSelf, ...data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, memberId, answers } = putSchema.parse(await request.json());
    const session = await requireAuth();
    const result = await answerFor(session, churchId, memberId ?? null, answers, (permission) => requireChurchPermission(permission, churchId));
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
