/** GET/PUT /api/ticketing/church/[churchId]/sites — activation des sites d'événement (spec 084). */
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getSitesEnabled, setSitesEnabled } from "@/modules/ticketing";
import { sitesSettingsSchema } from "./contract";

type Params = { params: Promise<{ churchId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    await requireChurchPermission("church:settings", churchId);
    return successResponse({ enabled: await getSitesEnabled(churchId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { churchId } = await params;
    const data = sitesSettingsSchema.parse(await request.json());
    const session = await requireChurchPermission("church:settings", churchId);
    await setSitesEnabled(churchId, data.enabled, session.user.id);
    return successResponse({ enabled: data.enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
