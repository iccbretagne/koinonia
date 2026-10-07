import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireChurchPermission } from "@/lib/auth";
import { computeAccountingStats, type Period } from "@/modules/accounting";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const period = (searchParams.get("period") ?? "year") as Period;

    if (!churchId) throw new ApiError(400, "churchId requis");
    if (!["month", "quarter", "year"].includes(period)) throw new ApiError(400, "period invalide");

    await requireChurchPermission("accounting:stats", churchId);

    return successResponse(await computeAccountingStats(churchId, period));
  } catch (error) {
    return errorResponse(error);
  }
}
