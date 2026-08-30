import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export type IntegrationScope =
  | { scoped: false }
  | { scoped: true; familyIds: number[] };

export async function isIntegrationMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: { function: "INTEGRATION", ministry: { churchId }, id: { in: userDeptIds } },
  });
  return count > 0;
}

export async function isMsdpMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: { function: "MSDP", ministry: { churchId }, id: { in: userDeptIds } },
  });
  return count > 0;
}

export async function requireIntegrationAccess(
  churchId: string
): Promise<{ session: Session; scope: IntegrationScope }> {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return { session, scope: { scoped: false } };

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("@/lib/registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  // Admin / Secrétaire → accès complet
  if (userPerms.has("members:manage") || userPerms.has("events:manage"))
    return { session, scope: { scoped: false } };

  // Équipe Intégration → accès complet
  if (await isIntegrationMember(session, churchId))
    return { session, scope: { scoped: false } };

  // Berger / co-berger → accès limité à leur(s) famille(s)
  const assignments = await prisma.familyLeaderAssignment.findMany({
    where: { churchId, userId: session.user.id! },
    select: { familyId: true },
  });
  if (assignments.length > 0)
    return { session, scope: { scoped: true, familyIds: assignments.map((a) => a.familyId) } };

  throw new Error("FORBIDDEN");
}

/**
 * Garde de l'export des demandes d'intégration : plus stricte que la consultation.
 *
 * Extraire des données personnelles hors de l'application n'est pas la même chose que les
 * consulter à l'écran (un fichier se transfère, s'oublie, ne se révoque pas). Un berger /
 * co-berger au périmètre restreint peut donc voir ses familles mais pas les exporter —
 * même principe que `discipleship:export` vs `discipleship:view`.
 */
export async function requireIntegrationExportAccess(
  churchId: string
): Promise<{ session: Session }> {
  const { session, scope } = await requireIntegrationAccess(churchId);
  if (scope.scoped) throw new Error("FORBIDDEN");
  return { session };
}
