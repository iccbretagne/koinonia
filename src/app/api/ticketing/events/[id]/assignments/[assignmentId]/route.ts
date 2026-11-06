import { successResponse, errorResponse } from "@/lib/api-utils";
import { deleteAssignment } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const { id, assignmentId } = await params;
    const { session } = await requireEventAction(id, "configure");
    await deleteAssignment(id, assignmentId, session.user.id);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
