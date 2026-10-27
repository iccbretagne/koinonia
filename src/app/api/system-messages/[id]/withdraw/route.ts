import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { getMessageChurchId, withdrawMessage } from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireMessageAuthorAccess(await getMessageChurchId(id));
    requireRateLimit(request, { prefix: `system-messages:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await withdrawMessage(id, { id: session.user.id! }));
  } catch (error) {
    return errorResponse(error);
  }
}
