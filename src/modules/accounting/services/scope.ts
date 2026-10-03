import type { Session } from "next-auth";

/**
 * Périmètre de lecture des demandes comptables dans une église :
 * - `null` : toutes les demandes (accounting:manage) ;
 * - sinon, les départements visibles — ceux du ou des ministères d'un Ministre, ceux assignés
 *   (`user_departments`) pour les autres rôles. Chacun voit en plus ses propres demandes.
 *
 * Toute liste ou lecture de demande/série passe par ce périmètre : un filtre fourni par
 * l'appelant (ex. `?departmentId=`) le restreint, il ne le remplace jamais.
 */
export async function getAccountingDepartmentScope(
  session: Session,
  churchId: string
): Promise<string[] | null> {
  const { rolePermissions } = await import("@/lib/registry");
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
  if (roles.flatMap((r) => rolePermissions[r] ?? []).includes("accounting:manage")) return null;

  const { prisma } = await import("@/lib/prisma");
  const userRoles = await prisma.userChurchRole.findMany({
    where: { userId: session.user.id!, churchId },
    include: { departments: { select: { departmentId: true } } },
  });

  if (roles.includes("MINISTER")) {
    const ministryIds = userRoles.map((r) => r.ministryId).filter(Boolean) as string[];
    if (ministryIds.length === 0) return [];
    const depts = await prisma.department.findMany({
      where: { ministryId: { in: ministryIds } },
      select: { id: true },
    });
    return depts.map((d) => d.id);
  }
  return userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
}

/** Condition Prisma du périmètre : départements visibles OU demandes/séries de l'appelant. */
export function accountingScopeWhere(scope: string[] | null, userId: string) {
  return scope === null ? {} : { OR: [{ departmentId: { in: scope } }, { submittedById: userId }] };
}
