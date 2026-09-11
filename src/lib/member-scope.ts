import type { Session } from "next-auth";
import { getUserDepartmentScope, getUserMinistryScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type MemberScope = { scoped: false } | { scoped: true; departmentIds: string[] };

/**
 * Périmètre de gestion des STAR dans une église.
 *
 * Part de `getUserDepartmentScope` (responsabilité explicite via `user_departments`) et y ajoute,
 * pour un Ministre, les départements de ses ministères : sans cela un Ministre a un périmètre vide
 * et ne voit aucun STAR, alors qu'il gère bien les départements de son ministère.
 * Reste un périmètre de responsabilité — aucune fusion avec l'appartenance (ADR-0009/ADR-0013).
 */
export async function resolveMemberDepartmentScope(
  session: Session,
  churchId: string
): Promise<MemberScope> {
  const deptScope = getUserDepartmentScope(session, churchId);
  if (!deptScope.scoped) return { scoped: false };

  const ministryScope = getUserMinistryScope(session, churchId);
  if (!ministryScope.scoped || ministryScope.ministryIds.length === 0) {
    return { scoped: true, departmentIds: deptScope.departmentIds };
  }

  const ministryDepts = await prisma.department.findMany({
    where: { ministryId: { in: ministryScope.ministryIds } },
    select: { id: true },
  });

  return {
    scoped: true,
    departmentIds: Array.from(
      new Set([...deptScope.departmentIds, ...ministryDepts.map((d) => d.id)])
    ),
  };
}
