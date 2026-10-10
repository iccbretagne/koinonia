import type { DbClient } from "../availability/db";

/**
 * Destinataires d'un désistement (spec 061) : les responsables du département (principal et
 * adjoints), sauf le STAR désisté lui-même s'il est responsable ; à défaut seulement, les
 * Ministres du ministère. Contrairement aux absences (`resolveResponsibleUserIds`), le Ministre
 * n'est jamais mis en copie.
 */
export async function resolveWithdrawalRecipients(
  churchId: string,
  departmentId: string,
  withdrawnMemberId: string,
  db: DbClient
): Promise<string[]> {
  const [heads, links] = await Promise.all([
    db.userDepartment.findMany({
      where: { departmentId, userChurchRole: { churchId, role: "DEPARTMENT_HEAD" } },
      select: { userChurchRole: { select: { userId: true } } },
    }),
    db.memberUserLink.findMany({ where: { memberId: withdrawnMemberId, churchId }, select: { userId: true } }),
  ]);
  const withdrawnUsers = new Set(links.map((l) => l.userId));
  const headIds = [...new Set(heads.map((h) => h.userChurchRole.userId))].filter((id) => !withdrawnUsers.has(id));
  if (headIds.length > 0) return headIds;

  const department = await db.department.findUnique({ where: { id: departmentId }, select: { ministryId: true } });
  if (!department) return [];
  const ministers = await db.userChurchRole.findMany({
    where: { churchId, role: "MINISTER", ministryId: department.ministryId },
    select: { userId: true },
  });
  return [...new Set(ministers.map((m) => m.userId))].filter((id) => !withdrawnUsers.has(id));
}
