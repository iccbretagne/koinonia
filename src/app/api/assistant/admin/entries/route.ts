import { errorResponse, successResponse } from "@/lib/api-utils";
import { createCustomEntry, listAdminEntries } from "@/modules/assistant";
import { entryInputSchema } from "@/modules/assistant/schemas";
import { assistantAdmin } from "../../_shared";

export async function GET() {
  try {
    await assistantAdmin();
    return successResponse(await listAdminEntries());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await assistantAdmin();
    const input = entryInputSchema.parse(await request.json());
    return successResponse(await createCustomEntry(input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
