import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getAvailabilitySettings, updateAvailabilitySettings } from "@/modules/planning";
import { z } from "zod";

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

const schema = z.object({
  churchId: z.string().min(1),
  enabled: z.boolean(),
  openMonthsBefore: z.number().int().min(1).max(6),
  closeDaysBefore: z.number().int().min(1).max(30),
  relanceDaysBefore: z.number().int().min(1).max(30),
  planningNoticeDelayMinutes: z.number().int().min(5, "Le délai doit être d'au moins 5 minutes").max(120, "Le délai ne peut pas dépasser 2 heures"),
});

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
