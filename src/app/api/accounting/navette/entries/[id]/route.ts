import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { deleteEntry, updateEntry } from "@/modules/shuttle";
import { actorOf, entryAccess, readEntryForm } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    requireRateLimit(request, { prefix: `shuttle:${access.session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { input, file } = await readEntryForm(request);
    const entry = await updateEntry(id, input, file, actorOf(access));
    return successResponse({ id: entry.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    requireRateLimit(request, { prefix: `shuttle:${access.session.user.id}`, ...RATE_LIMIT_MUTATION });
    await deleteEntry(id, actorOf(access));
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
