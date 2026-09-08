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
