import type { Session } from "next-auth";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEPT_FN } from "@/lib/department-functions";
import { getFunctionDepartmentIds } from "@/lib/function-departments";
import { canEditSettings, canManageApplications, type ServingUser } from "./services/access";

/**
 * Contexte d'un appelant authentifié dans une église, pour le module serving (spec 073). La
 * décision objet par objet se fait dans les services, avec les règles pures de `access.ts`.
 */
export type ServingActor = {
  session: Session;
  userId: string;
  user: ServingUser;
  churchId: string;
  /** PVS, Admin ou Super Admin : étude et traitement avant affectation. */
  canManage: boolean;
  /** Réglages : Super Admin, Admin, responsable du PVS. */
  canEditSettings: boolean;
  pvsDeptIds: string[];
  /** Fiches STAR liées au compte dans cette église (lien validé), pour la vue du STAR (D8). */
  linkedMemberIds: string[];
};

async function rolePermissions() {
  return (await import("@/lib/registry")).rolePermissions;
}

/** Départements PVS de l'église (fonction `VIE_DES_STAR`). */
export function getPvsDepartmentIds(churchId: string): Promise<string[]> {
  return getFunctionDepartmentIds(churchId, DEPT_FN.VIE_DES_STAR);
}

/**
 * Contexte serving d'une session déjà authentifiée, sans contrôle d'appartenance : pour le
 * calcul de la navigation, qui a déjà la session en main.
 */
export async function servingActorFromSession(session: Session, churchId: string): Promise<ServingActor> {
  const user = session.user;
  const [pvsDeptIds, perms, links] = await Promise.all([
    getPvsDepartmentIds(churchId),
    rolePermissions(),
    prisma.memberUserLink.findMany({
      where: { userId: user.id, churchId, validatedAt: { not: null } },
      select: { memberId: true },
    }),
  ]);
  return {
    session,
    userId: user.id,
    user,
    churchId,
    canManage: canManageApplications(user, churchId, pvsDeptIds, perms),
    canEditSettings: canEditSettings(user, churchId, pvsDeptIds, perms),
    pvsDeptIds,
    linkedMemberIds: links.map((l) => l.memberId),
  };
}

/**
 * Appelant authentifié ayant un rôle dans l'église (ou Super Admin). Ne donne aucun droit sur
 * une candidature à lui seul : les services filtrent ensuite.
 */
export async function requireServingActor(churchId: string): Promise<ServingActor> {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin && !session.user.churchRoles.some((r) => r.churchId === churchId)) {
    throw new Error("FORBIDDEN");
  }
  return servingActorFromSession(session, churchId);
}

/** Étude et traitement des candidatures : PVS, Admin, Super Admin. */
export async function requireServingManage(churchId: string): Promise<ServingActor> {
  const actor = await requireServingActor(churchId);
  if (!actor.canManage) throw new Error("FORBIDDEN");
  return actor;
}

/** Réglages des candidatures : Super Admin, Admin, responsable du PVS. */
export async function requireServingSettingsAccess(churchId: string): Promise<ServingActor> {
  const actor = await requireServingActor(churchId);
  if (!actor.canEditSettings) throw new Error("FORBIDDEN");
  return actor;
}
