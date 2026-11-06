import { errorResponse, successResponse } from "@/lib/api-utils";
import { countOpenPending, readStats } from "@/modules/assistant";
import { statsQuerySchema } from "@/modules/assistant/schemas";
import { assistantAdmin, queryOf } from "../../_shared";

export async function GET(request: Request) {
  try {
    await assistantAdmin();
    const { from, to } = queryOf(request, statsQuerySchema);
    const [stats, open] = await Promise.all([readStats(from, to), countOpenPending()]);
    return successResponse({ ...stats, openQuestions: open });
  } catch (error) {
    return errorResponse(error);
  }
}
