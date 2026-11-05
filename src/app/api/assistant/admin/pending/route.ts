import { errorResponse, successResponse } from "@/lib/api-utils";
import { listPending } from "@/modules/assistant";
import { pendingQuerySchema } from "@/modules/assistant/schemas";
import { assistantAdmin, queryOf } from "../../_shared";

export async function GET(request: Request) {
  try {
    await assistantAdmin();
    const { status } = queryOf(request, pendingQuerySchema);
    return successResponse(await listPending(status));
  } catch (error) {
    return errorResponse(error);
  }
}
