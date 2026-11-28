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
      { path: "/planning" },
      { path: "/evenements" },
      { path: "/demandes" },
      { path: "/medias/reseaux-sociaux" },
      { path: "/personnes/star" },
      { path: "/admin/departments" },
      { path: "/admin/ministries" },
      { path: "/admin/users" },
    ],
    api: [
      { path: "/api/absences" },
      { path: "/api/availability" },
      { path: "/api/announcements" },
      { path: "/api/departments" },
      { path: "/api/events" },
      { path: "/api/members" },
      { path: "/api/ministries" },
      { path: "/api/requests" },
      { path: "/api/welcome-duty" },
      { path: "/api/planning" },
      { path: "/api/team-events" },
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
    // Réglage de la collecte des disponibilités (spec 058) : fenêtre d'ouverture, clôture, relance
    "availability:settings": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  // Domaines de notification (spec 053). `planning` couvre déjà des emails aujourd'hui (rappels
  // de service) — activé par défaut, en entier (le domaine ne peut pas être « à moitié » activé).
  // `requests` (feuille d'annonces, statut d'une demande) n'en envoie aucun — désactivé par
  // défaut.
  notificationDomains: [
    {
      key: "planning",
      label: "Planning et service",
      description:
        "Récapitulatif des changements de service (envoyé une fois le planning stabilisé), rappel avant un service, événement déplacé ou annulé, absences et remplaçants.",
      defaultEmail: true,
      visibleWith: ["planning:view"],
    },
    {
      key: "requests",
      label: "Demandes",
      description: "Demande reçue, acceptée ou refusée, feuille d'annonces déposée.",
      defaultEmail: false,
      visibleWith: ["planning:view", "media:view"],
    },
  ],
});
