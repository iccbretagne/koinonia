import { requireAuth, requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { getMemberScope, isMemberLinkedToUser, type DeclarerScope } from "@/modules/planning";

/**
 * Lit `churchId`/`memberId` de la requête et vérifie que l'appelant peut agir sur les absences
 * de ce STAR : lui-même, ou `absences:manage` dans l'église et, s'il est restreint, le STAR
 * dans son périmètre départemental. Renvoie ce périmètre (non restreint pour soi-même).
 */
export async function requireAbsenceSubjectAccess(request: Request) {
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

  let declarerScope: DeclarerScope = { scoped: false, departmentIds: [] };
  const isSelf = await isMemberLinkedToUser(memberId, session.user.id, churchId);
  if (!isSelf) {
    const managerSession = await requireChurchPermission("absences:manage", churchId);
    const deptScope = getUserDepartmentScope(managerSession, churchId);
    if (deptScope.scoped) {
      const withinScope = memberScope.departmentIds.some((id) => deptScope.departmentIds.includes(id));
      if (!withinScope) throw new ApiError(403, "Ce STAR n'appartient pas à votre périmètre");
      declarerScope = deptScope;
    }
  }

  return { churchId, memberId, declarerScope };
}
