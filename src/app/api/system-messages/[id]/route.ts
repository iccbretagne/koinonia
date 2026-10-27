import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import {
  getMessageChurchId,
  getMessageForAuthor,
  getMessageForViewer,
  messageViewerFromSession,
  updateMessage,
} from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";
import { updateSchema } from "./contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const churchId = await getMessageChurchId(id);
    const isAuthor = await requireMessageAuthorAccess(churchId).then(
      () => true,
      () => false
    );
    if (isAuthor) return successResponse(await getMessageForAuthor(id));
    return successResponse(await getMessageForViewer(id, messageViewerFromSession(session)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Église du message, jamais celle affichée côté client.
    const session = await requireMessageAuthorAccess(await getMessageChurchId(id));
    requireRateLimit(request, { prefix: `system-messages:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const input = updateSchema.parse(await request.json());
    return successResponse(await updateMessage(id, input, { id: session.user.id! }));
  } catch (error) {
    return errorResponse(error);
  }
}
