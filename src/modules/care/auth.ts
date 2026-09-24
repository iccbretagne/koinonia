import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";

/**
 * Garde de qualification/affectation — `care:qualify` uniquement (Super Admin, Admin,
 * Référent soins pastoraux). Aucune approximation par `members:manage`/`events:manage` :
 * décision #583, voir ADR-0015 et plan.md (option 1).
 */
export async function requireCareQualify(churchId: string) {
  return requireChurchPermission("care:qualify", churchId);
}

export interface CareAccess {
  session: Session;
  /** `care:qualify` : qualifie, affecte, rejette, règle les paramètres du module. */
  canQualify: boolean;
  /** `care:view` (inclut `canQualify`) : vue d'ensemble sans droit d'agir. */
  canOverview: boolean;
  userId: string;
  /** Profils pastoraux de l'église rattachés au compte connecté (pour `isCurrentAssignee`). */
  ownProfileIds: string[];
}

/**
 * Résout l'accès `care` de la session courante, **sans jamais lever** : un accompagnant sans
 * `care:qualify`/`care:view` (membre du MSDP ou profil pastoral) reçoit `canQualify: false`,
 * `canOverview: false`, et n'accède qu'aux demandes dont il est l'accompagnant en charge — ce
 * périmètre se vérifie objet par objet (`isCurrentAssignee`, `services/assignee.ts`), pas ici.
 */
export async function getCareAccess(session: Session, churchId: string): Promise<CareAccess> {
  const userId = session.user.id!;

  let canQualify = false;
  let canOverview = false;

  if (session.user.isSuperAdmin) {
    canQualify = true;
    canOverview = true;
  } else {
    const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
    // Import dynamique : registry.ts importe tous les modules (dont care), un import statique
    // ici créerait un cycle (cf. issue #446).
    const { rolePermissions } = await import("@/lib/registry");
    const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
    canQualify = userPerms.has("care:qualify");
    canOverview = canQualify || userPerms.has("care:view");
  }

  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId, userId },
    select: { id: true },
  });

  return {
    session,
    canQualify,
    canOverview,
    userId,
    ownProfileIds: (profiles ?? []).map((p) => p.id),
  };
}
