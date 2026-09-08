import { requireAuth } from "@/lib/auth";
import { isCaptureTeamMember, isCaptureTeamLead } from "./services/access";
import { listOutgoingShares } from "./services/sharing";

/**
 * Gardes d'accès du module audio.
 *
 * Ces trois helpers vivaient dans `src/lib/auth.ts` et importaient le module audio
 * dynamiquement pour contourner le cycle `registry → modules → auth → modules` (chantier 4 de
 * `docs/roadmap-modularite.md`). Ce sont des règles du domaine audio, pas de l'infrastructure
 * d'authentification : ils rejoignent le module, comme `agenda/auth.ts` et `integration/auth.ts`
 * le font déjà, et leurs dépendances au module deviennent de simples imports statiques internes.
 *
 * L'import de `rolePermissions` reste dynamique : la règle `no-modules-static-import-registry`
 * l'impose depuis un module (cycle réel avec la racine de composition, ADR-0004).
 */

/**
 * Autorise l'accès aux ressources du module audio (vue, dépôt, révision).
 * Passe si : la permission de rôle donnée (`audio:view`/`audio:upload`/`audio:review`,
 * ADMIN/SECRETARY…) OU appartenance au département de captation configuré
 * (`Department.function = "CAPTATION_AUDIO"`), quel que soit le rôle — autonomie complète
 * dépôt → publication pour l'équipe technique (D7).
 */
export async function requireAudioAccess(permission: string, churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("@/lib/registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  if (userPerms.has(permission)) return session;

  const departmentIds = roles.flatMap((r) => r.departments.map((d) => d.department.id));
  if (await isCaptureTeamMember(churchId, departmentIds)) return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise l'écoute d'un culte publié de `churchId` — élargi aux bibliothèques partagées
 * (spec 036). Passe si : rôle portant `audio:listen` dans `churchId` (comportement existant)
 * OU une des propres églises de l'utilisateur portant `audio:listen` figure comme destinataire
 * d'un partage ouvert par `churchId` (bibliothèque ouverte à l'utilisateur, indirectement).
 * Rayon d'action volontairement borné à l'audio — ne touche pas `requireChurchPermission`,
 * qui garde tout le multi-tenant (plan.md).
 */
export async function requireAudioListenAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const { rolePermissions } = await import("@/lib/registry");

  const rolesInChurch = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const userPerms = new Set(rolesInChurch.flatMap((r) => rolePermissions[r.role] ?? []));
  if (userPerms.has("audio:listen")) return session;

  const guestChurchIds = Array.from(
    new Set(
      session.user.churchRoles
        .filter((r) => (rolePermissions[r.role] ?? []).includes("audio:listen"))
        .map((r) => r.churchId)
    )
  );

  if (guestChurchIds.length > 0) {
    const shares = await listOutgoingShares(churchId);
    if (shares.some((s) => guestChurchIds.includes(s.churchId))) return session;
  }

  throw new Error("FORBIDDEN");
}

/**
 * Autorise la dépublication d'un culte audio — geste plus lourd que publier (un lien déjà
 * partagé devient inopérant). Passe si : `audio:manage` (ADMIN/SECRETARY…) OU
 * responsable (`DEPARTMENT_HEAD`/`MINISTER`) du département de captation configuré.
 */
export async function requireAudioUnpublishAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("@/lib/registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  if (userPerms.has("audio:manage")) return session;

  if (await isCaptureTeamLead(session, churchId)) return session;

  throw new Error("FORBIDDEN");
}
