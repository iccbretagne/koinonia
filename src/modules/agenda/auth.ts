import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/registry";
import type { Session } from "next-auth";

/**
 * Vérifie si l'utilisateur est membre d'un département PROTOCOLE dans l'église donnée.
 * Les membres Protocole ont accès à agenda:manage et agenda:view.
 */
export async function isProtocoleMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: { function: "PROTOCOLE", ministry: { churchId }, id: { in: userDeptIds } },
  });
  return count > 0;
}

/**
 * Autorise la lecture de l'agenda pastoral.
 * Passe si : permission `agenda:view` (SUPER_ADMIN, ADMIN, SECRETARY, AGENDA_QUALIFIER)
 *         OU membre du département Protocole.
 * Les profils pastoraux liés sont gérés au niveau des routes individuelles (/agenda/[profileId]).
 */
export async function requireAgendaView(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("agenda:view") || await isProtocoleMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise la gestion de l'agenda pastoral (saisie directe + planification).
 * Passe si : permission `agenda:manage` (SUPER_ADMIN, ADMIN, SECRETARY)
 *         OU membre du département Protocole.
 */
export async function requireAgendaManage(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("agenda:manage") || await isProtocoleMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise la qualification des demandes de RDV (PENDING).
 * Passe si : permission `agenda:qualify` (SUPER_ADMIN, ADMIN, AGENDA_QUALIFIER).
 * Le Protocole n'a PAS ce droit — il ne voit que les demandes VALIDATED.
 */
export async function requireAgendaQualify(churchId: string) {
  return requireChurchPermission("agenda:qualify", churchId);
}
