export type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER";

const PLANNING_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const CONFIG_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"];
const MEMBERS_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"];
const REPORT_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "REPORTER"];
const DISCIPLESHIP_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "DEPARTMENT_HEAD", "DISCIPLE_MAKER"];

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
    title: "Bienvenue !",
    content:
      "Bienvenue dans Koinonia ! Ce tour vous guide a travers les principales fonctionnalites.",
  },
  {
    target: '[data-tour="sidebar-planning"]',
    title: "Planning",
    content:
      "Vos departements sont listes ici. Cliquez sur un departement pour voir son planning.",
    viewport: "desktop",
    roles: PLANNING_ROLES,
  },
  {
    target: '[data-tour="sidebar-events"]',
    title: "Evenements",
    content: "Accedez a la liste des evenements, au calendrier et aux comptes rendus avec export Excel des statistiques.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-members"]',
    title: "Membres",
    content: "Consultez et gerez les membres (STAR) de vos departements.",
    viewport: "desktop",
    roles: MEMBERS_ROLES,
  },
  {
    target: '[data-tour="sidebar-service"]',
    title: "Annonces",
    content:
      "Soumettez des annonces et suivez les demandes de service (secretariat, visuels, communication).",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-discipleship"]',
    title: "Discipolat",
    content:
      "Suivez les relations de discipolat, l'appel de presence et les statistiques.",
    viewport: "desktop",
    roles: DISCIPLESHIP_ROLES,
  },
  {
    target: '[data-tour="sidebar-config"]',
    title: "Configuration",
    content:
      "Gerez les departements, ministeres, eglises, acces et parametres.",
    viewport: "desktop",
    roles: CONFIG_ROLES,
  },
  {
    target: '[data-tour="sidebar-reports"]',
    title: "Comptes rendus",
    content:
      "Saisissez les comptes rendus de culte (orateur, statistiques) et exportez les donnees en Excel.",
    viewport: "desktop",
    roles: REPORT_ROLES,
  },
  {
    target: '[data-tour="bottom-nav"]',
    title: "Navigation",
    content:
      "Naviguez entre le planning, les evenements et les membres.",
    viewport: "mobile",
  },
  {
    target: '[data-tour="header-guide"]',
    title: "Guide",
    content: "Retrouvez le guide des fonctionnalites a tout moment ici.",
  },
  {
    target: '[data-tour="header-notifications"]',
    title: "Notifications",
    content:
      "Les notifications de changements de planning apparaissent ici.",
  },
  {
    target: '[data-tour="dashboard-actions"]',
    title: "Actions",
    content:
      "Basculez entre la vue par evenement, la vue mensuelle et la vue des taches.",
    roles: PLANNING_ROLES,
  },
  {
    target: '[data-tour="event-selector"]',
    title: "Selecteur",
    content:
      "Selectionnez un evenement pour afficher le planning correspondant.",
    roles: PLANNING_ROLES,
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
