import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getMemberScope, isMemberLinkedToUser, listTargetOptions, type DeclarerScope } from "@/modules/planning";

/**
 * GET /api/absences/target-options?churchId=&memberId=
 *
 * Liste les départements et événements ciblables pour la déclaration/modification d'une absence
 * du STAR `memberId` (spec 050) : mêmes gardes que `backup-options` — soi-même, ou
 * `absences:manage` + périmètre départemental si le déclarant est restreint.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const memberId = searchParams.get("memberId");
    if (!churchId || !memberId) throw new ApiError(400, "churchId et memberId requis");

    const session = await requireAuth();

    const memberScope = await getMemberScope(memberId);
    if (!memberScope) throw new ApiError(404, "Fiche STAR introuvable");
    if (memberScope.churchId && memberScope.churchId !== churchId) {
      throw new ApiError(403, "Cette fiche n'appartient pas à cette église");
    }

    const isSelf = await isMemberLinkedToUser(memberId, session.user.id, churchId);
    let declarerScope: DeclarerScope = { scoped: false, departmentIds: [] };

    if (!isSelf) {
      const managerSession = await requireChurchPermission("absences:manage", churchId);
      const deptScope = getUserDepartmentScope(managerSession, churchId);
      if (deptScope.scoped) {
        const withinScope = memberScope.departmentIds.some((id) => deptScope.departmentIds.includes(id));
        if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
        declarerScope = deptScope;
      }
    }

    const result = await listTargetOptions(prisma, churchId, memberId, declarerScope);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
