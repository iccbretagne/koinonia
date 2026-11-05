import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { deleteEntry, loadShuttleEntry, updateEntry } from "@/modules/shuttle";
import { actorOf, assertTreasuryLink, entryAccess, readEntryForm } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id);
    requireRateLimit(request, { prefix: `shuttle:${access.session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { input, file } = await readEntryForm(request);
    await assertTreasuryLink(access.churchId, input, await loadShuttleEntry(id));
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
    await assertTreasuryLink(access.churchId, null, await loadShuttleEntry(id));
    await deleteEntry(id, actorOf(access));
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
