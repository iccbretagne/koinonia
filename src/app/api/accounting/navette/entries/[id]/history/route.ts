import { errorResponse, successResponse } from "@/lib/api-utils";
import { getEntryHistory } from "@/modules/shuttle";
import { entryAccess } from "../../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await entryAccess(id);
    return successResponse(await getEntryHistory(id));
  } catch (error) {
    return errorResponse(error);
  }
}
