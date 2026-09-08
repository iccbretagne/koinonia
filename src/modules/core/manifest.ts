import { defineModule } from "@/core/module-registry";

/**
 * Module core — obligatoire, toujours chargé.
 *
 * Périmètre :
 *   - Authentification (NextAuth, Google OAuth)
 *   - Gestion des utilisateurs et des rôles (RBAC)
 *   - Gestion des églises (multi-tenant)
 *   - Journaux d'audit
 *   - Paramètres globaux
 *
 * Dépendances : aucune (module racine)
 */
export const coreModule = defineModule({
  name: "core",
  version: "1.0.0",

  // Adresses gérées via l'identité/RBAC de plateforme (comptes, rôles, églises, journal
  // d'audit) et le tableau de bord pastoral (self-service autour de PastoralProfile,
  // distinct de l'agenda que ce profil permet ensuite de consulter — voir module agenda).
  routes: {
    authenticated: [
      { path: "/profile" },
      { path: "/guide" },
      { path: "/admin/churches" },
      { path: "/admin/access" },
      { path: "/admin/audit-logs" },
      { path: "/admin/backups" },
      { path: "/admin/pastoral-profiles" },
      { path: "/pastoral" },
    ],
    api: [
      { path: "/api/churches" },
      { path: "/api/users" },
      { path: "/api/notifications" },
      { path: "/api/onboarding" },
      { path: "/api/audit-logs" },
      { path: "/api/admin/backups" },
    ],
  },

  permissions: {
    "church:manage": ["SUPER_ADMIN"],
    "users:manage":  ["SUPER_ADMIN"],
    // Gestion des accès/rôles au sein d'une église — distinct de users:manage (plateforme,
    // Super Admin uniquement). Remplace l'emprunt à events:manage (spec 031, issue #467)
    "access:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"],
  },

  navigation: [
    { label: "Configuration", icon: "settings", href: "/admin", permission: "users:manage" },
  ],
});
