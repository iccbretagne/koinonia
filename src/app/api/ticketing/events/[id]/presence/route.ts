import { successResponse, errorResponse } from "@/lib/api-utils";
import { getPresence } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireEventAction(id, "read");
    return successResponse(await getPresence(id));
  } catch (error) {
    return errorResponse(error);
  }
}
