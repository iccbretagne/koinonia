import { errorResponse, successResponse } from "@/lib/api-utils";
import { markDepositRetained } from "@/modules/shuttle";
import { noteSchema } from "@/modules/shuttle/schemas";
import { actorOf, entryAccess } from "../../../_shared";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await entryAccess(id, true);
    const { note } = noteSchema.parse(await request.json());
    const entry = await markDepositRetained(id, note, actorOf(access));
    return successResponse({ id: entry.id });
  } catch (error) {
    return errorResponse(error);
  }
}
