import { prisma } from "@/lib/prisma";
import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { cancelAbsence, getMemberScope, isMemberLinkedToUser } from "@/modules/planning";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  action: z.literal("cancel"),
});

/**
 * PATCH /api/absences/[id] — annulation uniquement (aucune autre mutation supportée).
 *
 * Autorisé : le créateur, la fiche STAR liée elle-même, un resp./ministre du
 * périmètre du membre, ou un manager global (absences:manage sans scope).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    patchSchema.parse(await request.json());

    const absence = await prisma.absence.findUnique({ where: { id } });
    if (!absence) throw new ApiError(404, "Absence introuvable");

    const isCreator = absence.createdById === session.user.id;
    const isSelf = await isMemberLinkedToUser(absence.memberId, session.user.id, absence.churchId);

    if (!isCreator && !isSelf) {
      const managerSession = await requireChurchPermission("absences:manage", absence.churchId);
      const deptScope = getUserDepartmentScope(managerSession, absence.churchId);
      if (deptScope.scoped) {
        const memberScope = await getMemberScope(absence.memberId);
        const withinScope = memberScope?.departmentIds.some((d) => deptScope.departmentIds.includes(d)) ?? false;
        if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
      }
    }

    const updated = await cancelAbsence({
      absenceId: id,
      churchId: absence.churchId,
      cancelledById: session.user.id,
    });

    await logAudit({
      userId: session.user.id,
      churchId: absence.churchId,
      action: "UPDATE",
      entityType: "Absence",
      entityId: id,
      details: { status: "CANCELLED" },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
