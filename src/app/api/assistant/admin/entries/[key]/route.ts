import { errorResponse, successResponse } from "@/lib/api-utils";
import { deleteCustomEntry, patchEntry } from "@/modules/assistant";
import { entryPatchSchema } from "@/modules/assistant/schemas";
import { assistantAdmin } from "../../../_shared";

type Params = { params: Promise<{ key: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { key } = await params;
    const { actor } = await assistantAdmin();
    await patchEntry(key, entryPatchSchema.parse(await request.json()), actor);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { key } = await params;
    const { actor } = await assistantAdmin();
    await deleteCustomEntry(key, actor);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
