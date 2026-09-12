import type { Prisma } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";

type DbClient = Prisma.TransactionClient;

/**
 * Départements de captation audio configurés pour l'église (D7 — jamais codé en dur) — portés
 * par la fonction de département `CAPTATION_AUDIO`, au même titre que Secrétariat,
 * Communication… (spec 021). Une fonction peut être portée par plusieurs départements (spec
 * 046) : tableau vide si le module n'a pas encore été configuré.
 */
export async function getCaptureDepartmentIds(churchId: string, db?: DbClient): Promise<string[]> {
  return getFunctionDepartmentIds(churchId, DEPT_FN.CAPTATION_AUDIO, db);
}

/**
 * Vrai si un des départements de l'utilisateur est un des départements de captation,
 * quel que soit son rôle (STAR compris) — autonomie complète dépôt → publication (D7).
 */
export async function isCaptureTeamMember(
  churchId: string,
  departmentIds: string[],
  db?: DbClient
): Promise<boolean> {
  if (departmentIds.length === 0) return false;
  const captureDepartmentIds = await getCaptureDepartmentIds(churchId, db);
  return captureDepartmentIds.some((id) => departmentIds.includes(id));
}

/**
 * Vrai si l'utilisateur a un rôle DEPARTMENT_HEAD ou MINISTER dont les départements
 * incluent un des départements de captation — seule distinction de rôle du module, réservée
 * à `unpublish` (dépublier un lien déjà partagé est un geste plus lourd que publier).
 */
export async function isCaptureTeamLead(session: Session, churchId: string, db?: DbClient): Promise<boolean> {
  const captureDepartmentIds = await getCaptureDepartmentIds(churchId, db);
  if (captureDepartmentIds.length === 0) return false;
  return session.user.churchRoles.some(
    (r) =>
      r.churchId === churchId &&
      (r.role === "DEPARTMENT_HEAD" || r.role === "MINISTER") &&
      r.departments.some((d) => captureDepartmentIds.includes(d.department.id))
  );
}
