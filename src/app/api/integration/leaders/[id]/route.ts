import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const assignment = await prisma.familyLeaderAssignment.findUnique({
      where: { id },
      select: { id: true, churchId: true, familyId: true, familyName: true, role: true, userId: true },
    });
    if (!assignment) throw new ApiError(404, "Affectation introuvable");

    const { session } = await requireIntegrationAccess(assignment.churchId);

    await prisma.familyLeaderAssignment.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      churchId: assignment.churchId,
      action: "DELETE",
      entityType: "FamilyLeaderAssignment",
      entityId: id,
      details: { familyId: assignment.familyId, familyName: assignment.familyName, role: assignment.role },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
