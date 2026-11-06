import { errorResponse, successResponse } from "@/lib/api-utils";
import { getEntryChurchId, getEntryHistory } from "@/modules/treasury";
import { treasuryOf } from "../../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await treasuryOf(await getEntryChurchId(id), "Ligne introuvable");
    return successResponse(await getEntryHistory(id));
  } catch (error) {
    return errorResponse(error);
  }
}
