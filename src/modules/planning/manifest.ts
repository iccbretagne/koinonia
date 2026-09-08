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

  routes: {
    authenticated: [
      { path: "/dashboard" },
      { path: "/events" },
      { path: "/planning" },
      { path: "/absences" },
      { path: "/requests" },
      { path: "/secretariat" },
      { path: "/communication" },
      { path: "/admin/departments" },
      { path: "/admin/ministries" },
      { path: "/admin/members" },
      { path: "/admin/events" },
      { path: "/admin/reports" },
      { path: "/admin/users" },
      { path: "/admin/welcome-duty" },
    ],
    api: [
      { path: "/api/absences" },
      { path: "/api/announcements" },
      { path: "/api/departments" },
      { path: "/api/events" },
      { path: "/api/members" },
      { path: "/api/ministries" },
      { path: "/api/requests" },
      { path: "/api/welcome-duty" },
      { path: "/api/planning" },
      { path: "/api/admin/members" },
      { path: "/api/member-user-links" },
      { path: "/api/member-link-requests" },
    ],
  },

  permissions: {
    // Planning
    "planning:view":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "STAR"],
    "planning:edit":       ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"],
    // Planning par département (grille /dashboard) — distinct de planning:view, qui couvre
    // aussi "Mon planning", les absences et l'agenda du STAR (spec 031, issue #462)
    "planning:department": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
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
    // Absences des STAR
    "absences:view":       ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
    "absences:manage":     ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
  },

  navigation: [
    { label: "Planning",    icon: "planning",    href: "/dashboard",    permission: "planning:department" },
    { label: "Événements",  icon: "calendar",    href: "/events",       permission: "events:view" },
    { label: "Membres",     icon: "members",     href: "/admin/members",permission: "members:view" },
    { label: "Annonces",    icon: "megaphone",   href: "/announcements",permission: "events:view" },
  ],
});
