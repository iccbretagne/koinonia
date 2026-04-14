export type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER" | "STAR";

const PLANNING_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const CONFIG_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"];
const MEMBERS_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const REPORT_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "REPORTER"];
const DISCIPLESHIP_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "DEPARTMENT_HEAD", "DISCIPLE_MAKER"];
const SERVICE_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];

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
      "Ce tour vous guide à travers les principales fonctionnalités. Vous pouvez le relancer à tout moment depuis le guide en haut de page.",
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
    title: "Événements",
    content:
      "Accédez à la liste et au calendrier des événements. Le sous-menu Comptes rendus permet de saisir les statistiques de présence et d'exporter les données en Excel.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-members"]',
    title: "Membres (STAR)",
    content:
      "Consultez et gérez les membres actifs (STAR) de vos départements : coordonnées, affectations, statuts.",
    viewport: "desktop",
    roles: MEMBERS_ROLES,
  },
  {
    target: '[data-tour="sidebar-service"]',
    title: "Demandes",
    content:
      "Soumettez des demandes de diffusion (annonce interne, réseaux sociaux, visuel) et suivez leur avancement. Les responsables Secrétariat, Communication et Production Média traitent les demandes depuis leur tableau de bord.",
    viewport: "desktop",
    roles: SERVICE_ROLES,
  },
  {
    target: '[data-tour="sidebar-discipleship"]',
    title: "Discipolat",
    content:
      "Gérez les relations Faiseur de Disciples ↔ disciple, enregistrez l'appel de présence et consultez les statistiques. Les FD ne voient que leurs propres disciples.",
    viewport: "desktop",
    roles: DISCIPLESHIP_ROLES,
  },
  {
    target: '[data-tour="sidebar-config"]',
    title: "Configuration",
    content:
      "Gérez les ministères, départements, accès et rôles, paramètres de l'église et journaux d'audit.",
    viewport: "desktop",
    roles: CONFIG_ROLES,
  },
  {
    target: '[data-tour="sidebar-reports"]',
    title: "Comptes rendus",
    content:
      "Saisissez les comptes rendus de culte (orateur, titre du message, statistiques de présence par département) et exportez les données sur une période.",
    viewport: "desktop",
    roles: REPORT_ROLES,
  },
  {
    target: '[data-tour="bottom-nav"]',
    title: "Navigation",
    content:
      "Naviguez rapidement entre le planning, les événements, les membres et le guide depuis cette barre.",
    viewport: "mobile",
  },
  {
    target: '[data-tour="dashboard-actions"]',
    title: "Vues du planning",
    content:
      "Basculez entre la vue par événement, la vue mensuelle et la vue des tâches du département.",
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
      "Retrouvez le guide complet des fonctionnalités à tout moment ici, avec les captures d'écran et les droits par rôle.",
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
