import { defineModule } from "@/core/module-registry";

/**
 * Module mrbs — optionnel.
 *
 * Périmètre :
 *   - SSO entre Koinonia (NextAuth) et MRBS (réservation de salles)
 *   - Endpoints API consommés par le plugin AuthKoinonia/SessionKoinonia côté MRBS
 *   - Page admin de liaison comptes MRBS ↔ Koinonia
 *
 * Activation : ajouter "mrbs" dans ENABLED_MODULES (ou retirer pour désactiver).
 * Dépendances : core uniquement.
 *
 * Niveaux MRBS :
 *   2 (Admin)     — isSuperAdmin ou rôle SUPER_ADMIN / ADMIN / SECRETARY
 *   1 (User)      — rôle MINISTER / DEPARTMENT_HEAD ou isDeputy sur un département
 *   0 (Read-only) — tous les autres utilisateurs authentifiés
 */
export const mrbsModule = defineModule({
  name: "mrbs",
  version: "1.0.0",
  dependsOn: ["core"],
  permissions: {
    "mrbs:manage": ["SUPER_ADMIN", "ADMIN"],
  },
});

/**
 * Calcule le niveau MRBS (0/1/2) d'un utilisateur dans une église donnée.
 * Exporté pour être réutilisé dans les endpoints API.
 */
export async function computeMrbsLevel(
  userId: string,
  churchId: string,
  isSuperAdmin: boolean
): Promise<0 | 1 | 2> {
  if (isSuperAdmin) return 2;

  const { prisma } = await import("@/lib/prisma");

  const churchRole = await prisma.userChurchRole.findFirst({
    where: { userId, churchId },
    select: {
      role: true,
      departments: { select: { isDeputy: true } },
    },
    orderBy: { role: "asc" },
  });

  if (!churchRole) return 0;

  const { role, departments } = churchRole;

  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "SECRETARY") return 2;
  if (role === "MINISTER" || role === "DEPARTMENT_HEAD") return 1;
  if (departments.some((d) => d.isDeputy)) return 1;

  return 0;
}
