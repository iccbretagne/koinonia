import { errorResponse, successResponse } from "@/lib/api-utils";
import { createEntry } from "@/modules/treasury";
import { currentTreasury, limitMutation, readEntryForm } from "../_shared";

export async function POST(request: Request) {
  try {
    const { churchId, session, actor } = await currentTreasury();
    limitMutation(request, session.user.id!);
    const { input, file } = await readEntryForm(request);
    const entry = await createEntry(churchId, input, file, actor);
    return successResponse({ id: entry.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
