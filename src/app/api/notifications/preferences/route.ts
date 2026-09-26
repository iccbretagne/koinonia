import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getPreferencesView, getVisibleDomainKeys, updatePreferences } from "@/lib/notification-preferences";
import { z } from "zod";

const putSchema = z.object({
  emailEnabled: z.boolean().optional(),
  domains: z.record(z.string(), z.boolean()).optional(),
});

export async function GET() {
  try {
    const session = await requireAuth();
    const view = await getPreferencesView(session.user.id!);
    return successResponse(view);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const userId = session.user.id!;
    const body = putSchema.parse(await request.json());

    if (body.domains) {
      const visibleKeys = await getVisibleDomainKeys(userId);
      for (const key of Object.keys(body.domains)) {
        if (!visibleKeys.has(key)) throw new ApiError(400, `Domaine de notification inconnu ou non accessible : "${key}"`);
      }
    }

    await updatePreferences(userId, body);
    const view = await getPreferencesView(userId);
    return successResponse(view);
  } catch (error) {
    return errorResponse(error);
  }
}
