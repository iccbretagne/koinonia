import { requireSuperAdmin } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getAppIconState, removeAppIcon, setAppIcon, setAppIconBadge } from "@/modules/core";
import { readAppIconForm } from "./_form";
import { deleteSchema } from "./contract";

export async function GET() {
  try {
    await requireSuperAdmin();
    return successResponse(await getAppIconState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSuperAdmin();
    requireRateLimit(request, { prefix: `app-icon:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { icon, background, badge } = await readAppIconForm(request);
    if (!icon && !badge) throw new ApiError(400, "Aucun fichier déposé");
    if (icon && !background) throw new ApiError(400, "Couleur de fond requise");

    const actor = { id: session.user.id! };
    let state = icon && background ? await setAppIcon(icon, background, actor) : null;
    if (badge) state = await setAppIconBadge(badge, actor);
    return successResponse(state);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSuperAdmin();
    requireRateLimit(request, { prefix: `app-icon:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { target } = deleteSchema.parse(await request.json());
    return successResponse(await removeAppIcon(target, { id: session.user.id! }));
  } catch (error) {
    return errorResponse(error);
  }
}
