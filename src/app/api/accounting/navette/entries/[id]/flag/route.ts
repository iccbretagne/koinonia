import { errorResponse, successResponse } from "@/lib/api-utils";
import { clearFlag, flagEntry } from "@/modules/shuttle";
import { noteSchema } from "@/modules/shuttle/schemas";
import { actorOf, entryAccess } from "../../../_shared";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id, true);
    const { note } = noteSchema.parse(await request.json());
    const entry = await flagEntry(id, note, actorOf(access));
    return successResponse({ id: entry.id, flagNote: entry.flagNote });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await entryAccess(id, true);
    const entry = await clearFlag(id, actorOf(access));
    return successResponse({ id: entry.id, flagNote: null });
  } catch (error) {
    return errorResponse(error);
  }
}
