import { errorResponse, successResponse } from "@/lib/api-utils";
import { deleteEntry, getEntryChurchId, updateEntry } from "@/modules/treasury";
import { limitMutation, readEntryForm, treasuryOf } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getEntryChurchId(id), "Ligne introuvable");
    limitMutation(request, session.user.id!);
    const { input, file } = await readEntryForm(request);
    const entry = await updateEntry(id, input, file, actor);
    return successResponse({ id: entry.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session, actor } = await treasuryOf(await getEntryChurchId(id), "Ligne introuvable");
    limitMutation(request, session.user.id!);
    await deleteEntry(id, actor);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
