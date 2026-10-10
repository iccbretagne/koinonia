import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getAvailabilitySettings, updateAvailabilitySettings } from "@/modules/planning";
import { schema } from "./contract";

/** Réglage de la collecte des disponibilités (spec 058) — `availability:settings`. */
export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("availability:settings", churchId);
    return successResponse(await getAvailabilitySettings(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, ...data } = schema.parse(await request.json());
    const session = await requireChurchPermission("availability:settings", churchId);
    const saved = await updateAvailabilitySettings(churchId, data);
    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AvailabilitySettings",
      entityId: churchId,
      details: data,
    });
    return successResponse(saved);
  } catch (error) {
    return errorResponse(error);
  }
}
