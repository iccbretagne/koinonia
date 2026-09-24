/**
 * GET/PUT /api/integration/settings — délais avant relance des demandes en attente
 * (spec 051), réglables par l'Admin/Secrétaire et le responsable de l'équipe intégration.
 */
import { z } from "zod";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  requireIntegrationSettingsAccess,
  getIntegrationSettings,
  updateIntegrationSettings,
} from "@/modules/integration";

const delay = z.number().int().min(1).max(365);

const schema = z.object({
  churchId: z.string().min(1),
  recontactDelayDays: delay,
  missionDelayDays: delay,
});

export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireIntegrationSettingsAccess(churchId);
    return successResponse(await getIntegrationSettings(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { churchId, ...delays } = schema.parse(await request.json());
    await requireIntegrationSettingsAccess(churchId);
    return successResponse(await updateIntegrationSettings(churchId, delays));
  } catch (error) {
    return errorResponse(error);
  }
}
