import { successResponse, errorResponse } from "@/lib/api-utils";
import { getEventDetail, updateEvent } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { eventUpdateSchema } from "./contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { access } = await requireEventAction(id, "read");
    const event = await getEventDetail(id);
    return successResponse({ ...event, myRoles: [...access.roles] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const data = eventUpdateSchema.parse(await request.json());
    return successResponse(await updateEvent(id, session.user.id, data));
  } catch (error) {
    return errorResponse(error);
  }
}
