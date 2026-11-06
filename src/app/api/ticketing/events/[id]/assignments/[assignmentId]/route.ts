import { successResponse, errorResponse } from "@/lib/api-utils";
import { deleteAssignment, updateAssignment } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { assignmentUpdateSchema } from "./contract";

type Params = { params: Promise<{ id: string; assignmentId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, assignmentId } = await params;
    const { session } = await requireEventAction(id, "configure");
    const input = assignmentUpdateSchema.parse(await request.json());
    return successResponse(await updateAssignment(id, assignmentId, session.user.id, input));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, assignmentId } = await params;
    const { session } = await requireEventAction(id, "configure");
    await deleteAssignment(id, assignmentId, session.user.id);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
