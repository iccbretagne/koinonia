import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormsGrantAdmin } from "@/modules/forms/auth";
import { revokeFormsAccess } from "@/modules/forms";

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const { session, churchId } = await requireFormsGrantAdmin();
    await revokeFormsAccess(churchId, session.user.id, userId);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
