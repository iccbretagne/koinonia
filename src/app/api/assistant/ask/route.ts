import { errorResponse, successResponse } from "@/lib/api-utils";
import { ask } from "@/modules/assistant";
import { askSchema } from "@/modules/assistant/schemas";
import { currentAssistant, dataRunner, limitQuestions } from "../_shared";

export async function POST(request: Request) {
  try {
    const { session, churchId, viewer } = await currentAssistant();
    limitQuestions(request, viewer.userId);
    const input = askSchema.parse(await request.json());
    return successResponse(await ask(input, { viewer, runData: dataRunner(session, churchId, viewer) }));
  } catch (error) {
    return errorResponse(error);
  }
}
