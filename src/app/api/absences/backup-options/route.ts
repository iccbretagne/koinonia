import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getMemberScope, isMemberLinkedToUser, resolveSubjectUserId, listBackupOptions } from "@/modules/planning";

/**
 * GET /api/absences/backup-options?churchId=&memberId=
 *
 * Liste les backups possibles pour l'absence du STAR `memberId` — utilisé quand un manager
 * (Super Admin/Admin/Secrétaire/Ministre/Resp. département) déclare ou modifie une absence pour
 * un tiers et doit savoir si ce tiers est lui-même Resp. département/Ministre (auquel cas un
 * backup peut être proposé, dans le périmètre de ce tiers).
 *
 * Ne fait qu'informer l'affichage : la validation d'écriture reste faite par
 * `validateBackupTargets` sur `POST`/`PATCH`.
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
    if (!isSelf) {
      const managerSession = await requireChurchPermission("absences:manage", churchId);
      const deptScope = getUserDepartmentScope(managerSession, churchId);
      if (deptScope.scoped) {
        const withinScope = memberScope.departmentIds.some((id) => deptScope.departmentIds.includes(id));
        if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
      }
    }

    const subjectUserId = await resolveSubjectUserId(memberId, churchId);
    if (!subjectUserId) return successResponse({ eligible: false, options: [] });

    const result = await listBackupOptions(subjectUserId, churchId);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
