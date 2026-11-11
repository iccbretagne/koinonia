/** GET /api/mcp/connections — assistants connectés du compte (spec 081). */
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listUserConnections } from "@/modules/mcp";

export async function GET() {
  try {
    const session = await requireAuth();
    return successResponse(await listUserConnections(session.user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
