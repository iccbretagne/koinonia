import type { Session } from "next-auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { DEPT_FN } from "@/lib/department-functions";

type Db = Pick<PrismaClient, "department" | "memberUserLink" | "memberDepartment">;

export interface ShuttleAccess {
  /** `shuttle:manage` dans l'église (ou Super Admin). */
  manager: boolean;
  /** Membre de l'équipe navette : fiche liée, responsable/adjoint, ou Ministre du ministère. */
  member: boolean;
  /** L'église a au moins un département de fonction NAVETTE. */
  hasTeam: boolean;
}

async function defaultDb(): Promise<Db> {
  return (await import("@/lib/prisma")).prisma;
}

/** Départements de fonction NAVETTE de l'église, avec leur ministère. */
export async function getShuttleDepartments(churchId: string, db?: Db) {
  db ??= await defaultDb();
  return db.department.findMany({
    where: { function: DEPT_FN.NAVETTE, ministry: { churchId } },
    select: { id: true, ministryId: true },
  });
}

/**
 * Droits d'un compte sur le registre de la navette (spec 073). L'appartenance est résolue côté
 * serveur à partir du compte de la session, à chaque appel (ADR-0013, règles 2 et 5) ; la
 * fonction NAVETTE confère des droits d'écriture énumérés par la spec (ADR-0014, règle 5).
 */
export async function getShuttleAccess(session: Session, churchId: string, db?: Db): Promise<ShuttleAccess> {
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  let manager = !!session.user.isSuperAdmin;
  if (!manager && roles.length > 0) {
    const { rolePermissions } = await import("@/lib/registry");
    manager = roles.some((r) => (rolePermissions[r.role] ?? []).includes("shuttle:manage"));
  }

  db ??= await defaultDb();
  const departments = await getShuttleDepartments(churchId, db);
  if (departments.length === 0) return { manager, member: false, hasTeam: false };
  const deptIds = departments.map((d) => d.id);
  const deptIdSet = new Set(deptIds);
  const ministryIds = new Set(departments.map((d) => d.ministryId));

  const lead = roles.some(
    (r) =>
      r.departments.some((d) => deptIdSet.has(d.department.id)) ||
      (r.role === "MINISTER" && !!r.ministryId && ministryIds.has(r.ministryId))
  );
  if (lead) return { manager, member: true, hasTeam: true };

  const link = await db.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  if (!link) return { manager, member: false, hasTeam: true };
  const count = await db.memberDepartment.count({
    where: { memberId: link.memberId, departmentId: { in: deptIds } },
  });
  return { manager, member: count > 0, hasTeam: true };
}

/** Gestionnaire ou membre de l'équipe navette de `churchId`, sinon `FORBIDDEN`. */
export async function requireShuttleAccess(churchId: string) {
  const session = await requireAuth();
  const access = await getShuttleAccess(session, churchId);
  if (!access.manager && !access.member) throw new Error("FORBIDDEN");
  return { session, ...access };
}

/** Gestionnaire du registre (`shuttle:manage`) dans `churchId`, sinon `FORBIDDEN`. */
export async function requireShuttleManager(churchId: string) {
  const result = await requireShuttleAccess(churchId);
  if (!result.manager) throw new Error("FORBIDDEN");
  return result;
}

/**
 * Entrée « Navette » visible (spec 073) : membre de l'équipe, ou gestionnaire d'une église qui a
 * un département Navette. Faux si le module est désactivé ou en cas d'erreur de lecture.
 */
export async function isShuttleVisible(session: Session, churchId: string | null | undefined): Promise<boolean> {
  if (!churchId) return false;
  const { registry } = await import("@/lib/registry");
  if (!registry.has("shuttle")) return false;
  const access = await getShuttleAccess(session, churchId).catch(() => null);
  return !!access && (access.member || (access.manager && access.hasTeam));
}
