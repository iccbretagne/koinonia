import { errorResponse, successResponse } from "@/lib/api-utils";
import { answerPending, deletePending, linkPending, markOffTopic } from "@/modules/assistant";
import { pendingActionSchema } from "@/modules/assistant/schemas";
import { assistantAdmin } from "../../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { actor } = await assistantAdmin();
    const action = pendingActionSchema.parse(await request.json());
    if (action.action === "answer") return successResponse(await answerPending(id, action.entry, actor));
    if (action.action === "link") return successResponse(await linkPending(id, action.entryKey, actor));
    return successResponse(await markOffTopic(id, actor));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { actor } = await assistantAdmin();
    await deletePending(id, actor);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
