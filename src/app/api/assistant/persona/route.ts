import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { getPersona, setPersona } from "@/modules/assistant";
import { personaSchema } from "@/modules/assistant/schemas";

export async function GET() {
  try {
    const session = await requireAuth();
    return successResponse({ persona: await getPersona(session.user.id!) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const { persona } = personaSchema.parse(await request.json());
    return successResponse({ persona: await setPersona(session.user.id!, persona) });
  } catch (error) {
    return errorResponse(error);
  }
}
