export type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER" | "STAR" | "PASTORAL_CARE_REFERENT" | "ACCOUNTANT";

const PLANNING_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const CONFIG_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"];
const MEMBERS_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const REPORT_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "REPORTER"];
const DISCIPLESHIP_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "DEPARTMENT_HEAD", "DISCIPLE_MAKER"];
const SERVICE_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "ACCOUNTANT"];
// « Gestion pastorale » n'apparaît que pour les roles qui qualifient ou traitent les demandes de RDV.
const PASTORAL_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "PASTORAL_CARE_REFERENT"];

export interface TourStep {
  /** CSS selector for the target element, or "center" for a centered modal */
  target: string;
  title: string;
  content: string;
  /** Only show for these roles. If undefined, show for all. */
  roles?: RoleKey[];
  /** "desktop" = hidden on mobile, "mobile" = hidden on desktop */
  viewport?: "desktop" | "mobile";
}

const ALL_STEPS: TourStep[] = [
  {
    target: "center",
    title: "Bienvenue dans Koinonia !",
    content:
      "Ce tour vous guide à travers les principales fonctionnalités. Vous pouvez le relancer à tout moment depuis le guide, dans le menu de votre compte.",
  },
  {
    target: '[data-tour="sidebar-planning"]',
    title: "Planning",
    content:
      "Vos départements sont listés ici, groupés par ministère. Cliquez sur un département pour voir et modifier le planning de service.",
    viewport: "desktop",
    roles: PLANNING_ROLES,
  },
  {
    target: '[data-tour="sidebar-events"]',
    title: "Agenda",
    content:
      "La liste et le calendrier des événements de l'église, l'agenda pastoral, et les comptes rendus (statistiques de présence, export Excel) pour ceux qui les saisissent.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-members"]',
    title: "Personnes",
    content:
      "Les membres actifs (STAR) de vos départements — coordonnées, affectations, statuts — mais aussi le discipolat, l'intégration des nouvelles familles, le suivi pastoral et les bergers de famille, regroupés ici.",
    viewport: "desktop",
    roles: MEMBERS_ROLES,
  },
  {
    target: '[data-tour="sidebar-service"]',
    title: "Demandes",
    content:
      "Retrouvez toutes vos demandes (annonce, visuel, RDV pastoral, demande comptable...) dans « Mes demandes ». L'espace « Communication & Production » regroupe les activités Photos, Visuels et Réseaux sociaux, avec un bouton « Partages » pour gérer vos liens actifs, sur le modèle de l'espace Audio. La Comptabilité (notes de frais, avances de budget) reste accessible séparément pour son équipe.",
    viewport: "desktop",
    roles: SERVICE_ROLES,
  },
  {
    // Le discipolat n'a plus de section propre : il vit dans « Personnes ».
    // L'étape reste, ancrée sur cette section, car les FD n'y voient qu'elle.
    target: '[data-tour="sidebar-members"]',
    title: "Discipolat",
    content:
      "Dans Personnes, gérez les relations Faiseur de Disciples ↔ disciple, enregistrez l'appel de présence et consultez les statistiques. Les FD ne voient que leurs propres disciples.",
    viewport: "desktop",
    roles: DISCIPLESHIP_ROLES,
  },
  {
    target: '[data-tour="sidebar-pastoral"]',
    title: "Suivi pastoral",
    content:
      "Les demandes de rendez-vous pastoral et les suivis de nouveaux convertis, déposés depuis le formulaire public : qualification, affectation au bon profil, puis planification — dans Personnes ou Agenda selon votre organisation.",
    viewport: "desktop",
    roles: PASTORAL_ROLES,
  },
  {
    target: '[data-tour="sidebar-ressources"]',
    title: "Ressources",
    content:
      "Réservez une salle et suivez vos réservations, consultez les offres d'emploi et les cultes audio publiés.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-config"]',
    title: "Administration",
    content:
      "Gérez les ministères, départements, accès et rôles, paramètres de l'église et journaux d'audit.",
    viewport: "desktop",
    roles: CONFIG_ROLES,
  },
  {
    target: '[data-tour="sidebar-reports"]',
    title: "Comptes rendus",
    content:
      "Dans Agenda, saisissez les comptes rendus de culte (orateur, titre du message, statistiques de présence par département) et exportez les données sur une période.",
    viewport: "desktop",
    roles: REPORT_ROLES,
  },
  {
    target: '[data-tour="bottom-nav"]',
    title: "Navigation",
    content:
      "Naviguez rapidement entre les sections prioritaires de votre rôle depuis cette barre ; « Plus » ouvre la liste complète des sections accessibles.",
    viewport: "mobile",
  },
  {
    target: '[data-tour="dashboard-actions"]',
    title: "Vues du planning",
    content:
      "Basculez entre la vue par événement, la vue mensuelle et la vue des tâches — cette dernière permet de créer les tâches récurrentes du département et de les affecter à un STAR pour un événement donné.",
    roles: PLANNING_ROLES,
  },
  {
    target: '[data-tour="event-selector"]',
    title: "Sélecteur d'événement",
    content:
      "Sélectionnez un événement pour afficher le planning correspondant. Les prochains événements sont proposés en premier.",
    roles: PLANNING_ROLES,
  },
  {
    target: '[data-tour="header-notifications"]',
    title: "Notifications",
    content:
      "Les changements de planning vous concernant (statut modifié, remplacement) apparaissent ici en temps réel.",
  },
  {
    target: '[data-tour="header-guide"]',
    title: "Guide utilisateur",
    content:
      "Le menu de votre compte (votre avatar) contient le guide complet des fonctionnalités, avec les captures d'écran et les droits par rôle.",
  },
];

export function getTourSteps(role: RoleKey, isMobile: boolean): TourStep[] {
  return ALL_STEPS.filter((s) => {
    if (s.roles && !s.roles.includes(role)) return false;
    if (s.viewport === "desktop" && isMobile) return false;
    if (s.viewport === "mobile" && !isMobile) return false;
    return true;
  });
}
