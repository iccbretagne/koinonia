import { errorResponse, successResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { countToComplete, createSlots, listInterviewers, listSlots } from "@/modules/serving";
import { requireServingManage } from "@/modules/serving/auth";
import { createSlotsSchema, slotsQuerySchema } from "./contract";

const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);

export async function GET(request: Request) {
  try {
    const query = slotsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireServingManage(query.churchId);
    const now = new Date();
    const [slots, interviewers, toComplete] = await Promise.all([
      listSlots(query.churchId, { from: query.from ? dayStart(query.from) : undefined, to: query.to ? dayStart(query.to) : undefined }, now),
      listInterviewers(query.churchId),
      countToComplete(query.churchId, now),
    ]);
    return successResponse({ slots, interviewers, toComplete });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSlotsSchema.parse(await request.json());
    const actor = await requireServingManage(input.churchId);
    requireRateLimit(request, { prefix: `serving:${actor.userId}`, ...RATE_LIMIT_MUTATION });
    const created = await createSlots(input.churchId, "series" in input ? { series: input.series } : { slots: input.slots }, actor.userId);
    await logAudit({
      userId: actor.userId,
      churchId: input.churchId,
      action: "CREATE",
      entityType: "ServingInterviewSlot",
      entityId: input.churchId,
      details: { created, series: "series" in input },
    });
    return successResponse({ created }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
