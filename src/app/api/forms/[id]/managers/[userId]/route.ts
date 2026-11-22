import { successResponse, errorResponse } from "@/lib/api-utils";
import { requireFormManage } from "@/modules/forms/auth";
import { removeFormManager } from "@/modules/forms";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params;
    const { session, churchId } = await requireFormManage(id, { owner: true });
    await removeFormManager(id, churchId, session.user.id, userId);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
