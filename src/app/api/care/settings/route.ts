/**
 * GET/PUT /api/care/settings — délais de relance des demandes de rendez-vous pastoral
 * (spec 052, T59), réglables par le référent soins pastoraux, l'Admin ou le Super Admin.
 */
import { z } from "zod";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireCareQualify, getCareSettings, updateCareSettings } from "@/modules/care";

const delay = z.number().int().min(1).max(365);

const schema = z.object({
  churchId: z.string().min(1),
  unassignedDelayDays: delay,
  unscheduledDelayDays: delay,
});

export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireCareQualify(churchId);
    return successResponse(await getCareSettings(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, ...delays } = schema.parse(await request.json());
    await requireCareQualify(churchId);
    return successResponse(await updateCareSettings(churchId, delays));
  } catch (error) {
    return errorResponse(error);
  }
}
