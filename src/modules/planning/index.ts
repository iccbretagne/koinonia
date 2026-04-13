import { defineModule } from "@/core/module-registry";

/**
 * Module planning — ex-Koinonia.
 *
 * Périmètre :
 *   - Événements, planning par département, comptes rendus
 *   - Membres (STAR) et départements
 *   - Demandes (Request workflow)
 *   - Annonces (diffusion interne, visuel, réseaux sociaux)
 *
 * Dépendances : core (obligatoire)
 * Intégrations : media (optionnelle — cross-module via event bus uniquement)
 */
export const planningModule = defineModule({
  name: "planning",
  version: "1.0.0",
  dependsOn: ["core"],
  optionalDependencies: ["media"],

  permissions: {
    // Planning
    "planning:view":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "planning:edit":       ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"],
    // Membres (STAR)
    "members:view":        ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "members:manage":      ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"],
    // Événements
    "events:view":         ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "REPORTER"],
    "events:manage":       ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Départements
    "departments:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "departments:manage":  ["SUPER_ADMIN", "ADMIN", "MINISTER"],
    // Comptes rendus
    "reports:view":        ["SUPER_ADMIN", "ADMIN", "SECRETARY", "REPORTER"],
    "reports:edit":        ["SUPER_ADMIN", "ADMIN", "SECRETARY", "REPORTER"],
  },

  navigation: [
    { label: "Planning",    icon: "planning",    href: "/dashboard",    permission: "planning:view" },
    { label: "Événements",  icon: "calendar",    href: "/events",       permission: "events:view" },
    { label: "Membres",     icon: "members",     href: "/admin/members",permission: "members:view" },
    { label: "Annonces",    icon: "megaphone",   href: "/announcements",permission: "events:view" },
  ],
});
