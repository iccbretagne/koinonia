import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { id } = await params;
    const assignment = await prisma.welcomeDutyAssignment.findFirst({ where: { id, churchId } });
    if (!assignment) throw new ApiError(404, "Affectation introuvable");

    await prisma.welcomeDutyAssignment.delete({ where: { id } });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
