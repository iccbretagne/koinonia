import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { createEntry } from "@/modules/shuttle";
import { actorOf, assertTreasuryLink, currentChurchAccess, readEntryForm } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await currentChurchAccess();
    requireRateLimit(request, { prefix: `shuttle:${access.session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { input, file } = await readEntryForm(request);
    await assertTreasuryLink(access.churchId, input);
    const entry = await createEntry(access.churchId, input, file, actorOf(access));
    return successResponse({ id: entry.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
