import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { listCollectionMonths, openCollectionNow } from "@/modules/planning";
import { z } from "zod";

/** Collectes des mois à venir et ouverture anticipée (spec 058) — `availability:settings`. */
export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("availability:settings", churchId);
    return successResponse(await listCollectionMonths(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

const schema = z.object({
  churchId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export async function POST(request: Request) {
  try {
    const { churchId, month } = schema.parse(await request.json());
    const session = await requireChurchPermission("availability:settings", churchId);
    const result = await openCollectionNow(churchId, new Date(`${month}-01T00:00:00.000Z`));
    await logAudit({
      userId: session.user.id,
      churchId,
      action: "CREATE",
      entityType: "AvailabilityCollection",
      entityId: `${churchId}:${month}`,
      details: { month, manual: true },
    });
    return successResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
