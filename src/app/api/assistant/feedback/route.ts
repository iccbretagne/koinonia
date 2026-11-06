import { errorResponse, successResponse } from "@/lib/api-utils";
import { recordFeedback } from "@/modules/assistant";
import { feedbackSchema } from "@/modules/assistant/schemas";
import { currentAssistant, limitQuestions } from "../_shared";

export async function POST(request: Request) {
  try {
    const { viewer } = await currentAssistant();
    limitQuestions(request, viewer.userId);
    const input = feedbackSchema.parse(await request.json());
    return successResponse(await recordFeedback(input, viewer));
  } catch (error) {
    return errorResponse(error);
  }
}
