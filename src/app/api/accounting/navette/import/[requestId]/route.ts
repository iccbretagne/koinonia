import { errorResponse, successResponse } from "@/lib/api-utils";
import { importExpenseReport } from "@/modules/shuttle";
import { importInputSchema } from "@/modules/shuttle/schemas";
import { actorOf, currentChurchAccess } from "../../_shared";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await params;
    const access = await currentChurchAccess(true);
    const { category } = importInputSchema.parse(await request.json());
    const entry = await importExpenseReport(access.churchId, requestId, category, actorOf(access));
    return successResponse({ id: entry.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
