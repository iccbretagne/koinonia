import { defineModule } from "@/core/module-registry";

/**
 * Module emploi — transversal, ouvert à tous les utilisateurs authentifiés.
 *
 * Périmètre :
 *   - Offres d'emploi, de stage et d'alternance
 *   - Profils de recherche d'emploi (flux candidat)
 *   - Abonnements aux notifications par type
 *   - Modération (archivage) par les admins et secrétaires
 *
 * Dépendances : core
 */
export const jobsModule = defineModule({
  name: "jobs",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/jobs" }, { path: "/admin/jobs" }],
    api: [{ path: "/api/jobs" }],
  },

  permissions: {
    "jobs:view":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "PASTORAL_CARE_REFERENT", "ACCOUNTANT"],
    "jobs:post":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "PASTORAL_CARE_REFERENT", "ACCOUNTANT"],
    "jobs:seek":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "PASTORAL_CARE_REFERENT", "ACCOUNTANT"],
    "jobs:freelance":  ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "PASTORAL_CARE_REFERENT", "ACCOUNTANT"],
    "jobs:manage":     ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  // Domaine de notification (spec 053) : envoie déjà des emails (relance de renouvellement
  // d'offre, inconditionnelle) — activé par défaut. Les alertes de nouvelles offres restent
  // gouvernées par le réglage détaillé existant (`JobNotificationSubscription`), affiché sur la
  // même page mais indépendant de ce booléen.
  notificationDomains: [
    {
      key: "jobs",
      label: "Emploi",
      description: "Offres et profils (réglages détaillés ci-dessous).",
      defaultEmail: true,
      visibleWith: ["jobs:view"],
    },
  ],
});
