import type { Session } from "next-auth";
import { requireAuth } from "@/lib/auth";

/**
 * Accès à la trésorerie (spec 076) : Comptable, Admin, Super Admin, résolus par
 * `rolePermissions` dans l'église visée. Aucun autre rôle, Secrétaire comprise.
 */

async function hasPermission(session: Session, churchId: string, permission: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = (session.user.churchRoles ?? []).filter((r) => r.churchId === churchId);
  if (roles.length === 0) return false;
  const { rolePermissions } = await import("@/lib/registry");
  return roles.some((r) => (rolePermissions[r.role] ?? []).includes(permission));
}

/** `treasury:manage` dans `churchId`, sinon `FORBIDDEN`. */
export async function requireTreasuryAccess(churchId: string) {
  const session = await requireAuth();
  if (!(await hasPermission(session, churchId, "treasury:manage"))) throw new Error("FORBIDDEN");
  return { session, canReopen: await hasPermission(session, churchId, "treasury:reopen") };
}

/** `treasury:reopen` (Admin, Super Admin) dans `churchId`, sinon `FORBIDDEN`. */
export async function requireTreasuryReopen(churchId: string) {
  const session = await requireAuth();
  if (!(await hasPermission(session, churchId, "treasury:reopen"))) throw new Error("FORBIDDEN");
  return { session };
}

/** Entrée « Trésorerie » visible : module actif et `treasury:manage` dans l'église. */
export async function isTreasuryVisible(session: Session, churchId: string | null | undefined): Promise<boolean> {
  if (!churchId) return false;
  const { registry } = await import("@/lib/registry");
  if (!registry.has("treasury")) return false;
  return hasPermission(session, churchId, "treasury:manage");
}
