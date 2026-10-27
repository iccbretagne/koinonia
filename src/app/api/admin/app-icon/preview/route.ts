import { requireSuperAdmin } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { previewAppIcon } from "@/modules/core";
import { readAppIconForm } from "../_form";

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdmin();
    requireRateLimit(request, { prefix: `app-icon:preview:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { icon, background, badge } = await readAppIconForm(request);
    if (!icon && !badge) throw new ApiError(400, "Aucun fichier déposé");
    return successResponse(await previewAppIcon({ icon, background, badge }));
  } catch (error) {
    return errorResponse(error);
  }
}
