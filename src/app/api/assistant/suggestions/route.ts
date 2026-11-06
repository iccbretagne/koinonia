import { errorResponse, successResponse } from "@/lib/api-utils";
import { DEFAULT_SUGGESTIONS, entriesForScreen, loadKnowledge, viewerEntries } from "@/modules/assistant";
import { suggestionsQuerySchema } from "@/modules/assistant/schemas";
import { currentAssistant, queryOf } from "../_shared";

const COUNT = 3;

export async function GET(request: Request) {
  try {
    const { viewer } = await currentAssistant();
    const { screen } = queryOf(request, suggestionsQuerySchema);
    const { visible } = viewerEntries((await loadKnowledge()).entries, viewer);
    const answerable = visible.filter((e) => e.kind !== "fixed");
    const forScreen = entriesForScreen(answerable, screen);
    const defaults = DEFAULT_SUGGESTIONS.map((k) => answerable.find((e) => e.key === k)).filter((e) => e !== undefined);
    const picked = [...new Map([...forScreen, ...defaults].map((e) => [e.key, e])).values()].slice(0, COUNT);
    return successResponse(picked.map((e) => ({ key: e.key, title: e.title, question: e.questions[0] ?? e.title })));
  } catch (error) {
    return errorResponse(error);
  }
}
