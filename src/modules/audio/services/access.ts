import type { Prisma } from "@/generated/prisma/client";
import type { Session } from "next-auth";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * Département de captation audio configuré pour l'église (D7 — jamais codé en dur) — porté par
 * la fonction de département `CAPTATION_AUDIO`, au même titre que Secrétariat, Communication…
 * (spec 021, ramené dans le mécanisme commun des fonctions de département).
 * `null` si le module n'a pas encore été configuré.
 */
export async function getCaptureDepartmentId(churchId: string, db?: DbClient): Promise<string | null> {
  db ??= await defaultDb();
  const department = await db.department.findFirst({
    where: { function: "CAPTATION_AUDIO", ministry: { churchId } },
    select: { id: true },
  });
  return department?.id ?? null;
}

/**
 * Vrai si un des départements de l'utilisateur est le département de captation,
 * quel que soit son rôle (STAR compris) — autonomie complète dépôt → publication (D7).
 */
export async function isCaptureTeamMember(
  churchId: string,
  departmentIds: string[],
  db?: DbClient
): Promise<boolean> {
  if (departmentIds.length === 0) return false;
  const captureDepartmentId = await getCaptureDepartmentId(churchId, db);
  if (!captureDepartmentId) return false;
  return departmentIds.includes(captureDepartmentId);
}

/**
 * Vrai si l'utilisateur a un rôle DEPARTMENT_HEAD ou MINISTER dont les départements
 * incluent le département de captation — seule distinction de rôle du module, réservée
 * à `unpublish` (dépublier un lien déjà partagé est un geste plus lourd que publier).
 */
export async function isCaptureTeamLead(session: Session, churchId: string, db?: DbClient): Promise<boolean> {
  const captureDepartmentId = await getCaptureDepartmentId(churchId, db);
  if (!captureDepartmentId) return false;
  return session.user.churchRoles.some(
    (r) =>
      r.churchId === churchId &&
      (r.role === "DEPARTMENT_HEAD" || r.role === "MINISTER") &&
      r.departments.some((d) => d.department.id === captureDepartmentId)
  );
}
