import { successResponse, errorResponse } from "@/lib/api-utils";
import { getEventDetail, listChurchAccounts, setRoles } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { rolesSchema } from "./contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { access } = await requireEventAction(id, "configure");
    const [event, accounts] = await Promise.all([getEventDetail(id), listChurchAccounts(access.churchId)]);
    return successResponse({ roles: event.roles, accounts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await requireEventAction(id, "configure");
    const { roles } = rolesSchema.parse(await request.json());
    return successResponse(await setRoles(id, session.user.id, roles));
  } catch (error) {
    return errorResponse(error);
  }
}
