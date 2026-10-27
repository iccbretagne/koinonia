import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { requireChurchPermission } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { createMessage, listMessages } from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";
import { createSchema } from "./contract";

export async function GET(request: Request) {
  try {
    const churchId = new URL(request.url).searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("messages:publish", churchId);
    return successResponse(await listMessages(churchId, { isSuperAdmin: Boolean(session.user.isSuperAdmin) }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await request.json());
    const session = await requireMessageAuthorAccess(input.scope === "church" ? input.churchId : null);
    requireRateLimit(request, { prefix: `system-messages:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await createMessage(input, { id: session.user.id! }), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
