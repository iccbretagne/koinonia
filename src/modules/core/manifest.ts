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
    // Gestion des comptes utilisateurs d'une église : liste, pré-création, suppression d'un
    // compte jamais connecté, renommage (spec 054/#583 — ne s'approxime plus par
    // members:manage, détenu par tout Ministre/Resp. département quel que soit son périmètre).
    "users:manage":  ["SUPER_ADMIN", "ADMIN"],
    // Gestion des accès/rôles au sein d'une église — distinct de users:manage (cycle de vie du
    // compte). Remplace l'emprunt à events:manage (spec 031, issue #467)
    "access:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"],
    // Attribuer/retirer les rôles d'administration d'une église (Admin, Secrétaire) — en plus
    // d'access:manage. Le rôle Super Admin, lui, ne s'attribue que par un Super Admin.
    "access:admins": ["SUPER_ADMIN", "ADMIN"],
    // Configuration propre à UNE église, distincte de church:manage (création/suppression
    // d'églises, réservée à la plateforme) : profils pastoraux, paramètres de l'église (emails
    // secrétariat/comptabilité, couleur, responsable pastoral) et historique des modifications.
    // Le nom, l'adresse publique (slug) et le superviseur restent à church:manage.
    "church:settings": ["SUPER_ADMIN", "ADMIN"],
  },

  // Domaine de notification (spec 053) : aucun email aujourd'hui (rôle attribué, liaison
  // membre) — désactivé par défaut. Toujours affiché (`visibleWith` omis) : rôle attribué et
  // liaison membre concernent potentiellement tout utilisateur, quel que soit son rôle.
  notificationDomains: [
    {
      key: "account",
      label: "Compte et accès",
      description: "Rôle attribué, liaison avec la fiche membre acceptée ou refusée.",
      defaultEmail: false,
    },
  ],

  navigation: [
    { label: "Configuration", icon: "settings", href: "/admin", permission: "users:manage" },
  ],
});
