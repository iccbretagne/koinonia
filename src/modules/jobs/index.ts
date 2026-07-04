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

  permissions: {
    "jobs:view":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    "jobs:post":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    "jobs:seek":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    "jobs:freelance":  ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    "jobs:manage":     ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },
});
