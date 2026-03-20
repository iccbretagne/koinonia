export type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER";

const ADMIN_ROLES: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"];

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
      "Bienvenue dans PlanningCenter ! Ce tour vous guide a travers les principales fonctionnalites.",
  },
  {
    target: '[data-tour="sidebar-departments"]',
    title: "Departements",
    content:
      "Vos departements sont listes ici. Cliquez sur un departement pour voir son planning.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-events"]',
    title: "Evenements",
    content: "Accedez a la liste des evenements et au calendrier.",
    viewport: "desktop",
  },
  {
    target: '[data-tour="sidebar-admin"]',
    title: "Administration",
    content:
      "Gerez les membres, departements, ministeres et evenements.",
    viewport: "desktop",
    roles: ADMIN_ROLES,
  },
  {
    target: '[data-tour="bottom-nav"]',
    title: "Navigation",
    content:
      "Naviguez entre les departements, evenements et l'administration.",
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
  },
  {
    target: '[data-tour="event-selector"]',
    title: "Selecteur",
    content:
      "Selectionnez un evenement pour afficher le planning correspondant.",
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
