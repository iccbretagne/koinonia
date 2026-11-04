import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth, requireCurrentChurchPermission } from "@/lib/auth";
import { createEvent, isTicketingManager, listEvents } from "@/modules/ticketing";
import { eventCreateSchema } from "./contract";

export async function GET() {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    const manager = await isTicketingManager(session, churchId);
    return successResponse(await listEvents(churchId, session.user.id, manager));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { session, churchId } = await requireCurrentChurchPermission("ticketing:manage");
    const data = eventCreateSchema.parse(await request.json());
    const event = await createEvent(churchId, session.user.id, data);
    return successResponse(event, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
