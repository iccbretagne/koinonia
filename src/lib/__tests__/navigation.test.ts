import { describe, it, expect } from "vitest";
import {
  bottomDestinations,
  buildBreadcrumb,
  buildSpaces,
  filterByQuery,
  isDestinationActive,
  landingHref,
  normalizeText,
  parentLink,
  resolveActive,
  searchablePages,
  type NavigationInput,
} from "../navigation";

const FAMILLES = "https://familles.example";

/** Sections telles que `(auth)/layout.tsx` les calcule pour un STAR lié à une fiche. */
const star: NavigationInput = {
  departments: [],
  configLinks: [],
  requestLinks: [{ href: "/agenda/request", label: "Demande RDV pastoral" }],
  mediaLinks: [{ href: "/audio", label: "Audio" }],
  agendaLinks: [],
  integrationLinks: [],
  famillesUrl: FAMILLES,
  hasMyPlanning: true,
  showStarEvents: true,
  hasAvailability: true,
  hasJobs: true,
  homeHref: "/planning",
};

/** Responsable de département : grille par département, STAR, événements. */
const deptHead: NavigationInput = {
  departments: [
    { id: "d1", name: "Choristes", ministryName: "Louange" },
    { id: "d2", name: "Musiciens", ministryName: "Louange" },
  ],
  configLinks: [],
  requestLinks: [{ href: "/requests", label: "Mes demandes" }],
  mediaLinks: [{ href: "/audio", label: "Audio" }],
  famillesUrl: FAMILLES,
  hasPlanningAccess: true,
  hasMembersAccess: true,
  hasDiscipleship: true,
  hasEventsAccess: true,
  hasAbsences: true,
  hasAccounting: true,
  hasRooms: true,
  hasJobs: true,
  homeHref: "/dashboard",
};

/** Admin : tout, dont l'administration, l'agenda pastoral et le suivi pastoral. */
const admin: NavigationInput = {
  ...deptHead,
  configLinks: [
    { href: "/admin/departments", label: "Départements" },
    { href: "/admin/departments/functions", label: "Fonctions dép." },
  ],
  requestLinks: [
    { href: "/requests", label: "Mes demandes" },
    { href: "/secretariat/requests", label: "Traitement des demandes" },
  ],
  mediaLinks: [
    { href: "/media", label: "Communication & Production", matchPrefixes: ["/media", "/communication"] },
    { href: "/audio", label: "Audio" },
  ],
  agendaLinks: [
    { href: "/agenda", label: "Vue agenda" },
    { href: "/agenda/schedule", label: "Planification" },
    { href: "/care", label: "Suivi pastoral" },
  ],
  integrationLinks: [{ href: "/integration/requests", label: "Intégration" }],
  hasEventsManage: true,
  hasReports: true,
};

function hrefs(input: NavigationInput): string[] {
  return buildSpaces(input).flatMap((s) => s.pages.map((p) => p.href));
}

describe("landingHref", () => {
  it("mène à la page « Aujourd'hui » hors vue pastorale", () => {
    // Spec 055 : la page « Aujourd'hui » est l'accueil de tous les rôles hors vue pastorale.
    expect(landingHref({ isPastoral: false, hasPlanningAccess: true, hasStarPlanning: true })).toBe("/accueil");
    expect(landingHref({ isPastoral: false, hasPlanningAccess: false, hasStarPlanning: true })).toBe("/accueil");
    expect(landingHref({ isPastoral: false, hasPlanningAccess: false, hasStarPlanning: false })).toBe("/accueil");
  });

  it("la vue pastorale a son propre accueil", () => {
    expect(landingHref({ isPastoral: true, hasPlanningAccess: true, hasStarPlanning: true })).toBe("/pastoral");
  });
});

describe("buildSpaces", () => {
  it("regroupe en espaces dans l'ordre de 10-navigation.md, sans espace vide", () => {
    expect(buildSpaces(admin).map((s) => s.key)).toEqual([
      "home",
      "planning",
      "agenda",
      "people",
      "requests",
      "media",
      "resources",
      "admin",
    ]);
    expect(buildSpaces(star).map((s) => s.key)).toEqual(["home", "planning", "agenda", "people", "requests", "media", "resources"]);
  });

  it("STAR : aucune grille par département, les liens STAR des événements, le RDV pastoral autonome", () => {
    const links = hrefs(star);
    expect(links).toEqual(
      expect.arrayContaining(["/planning", "/disponibilites", "/planning/events", "/events/announcement-sheets", "/agenda/request", "/audio", "/jobs", FAMILLES])
    );
    expect(links.some((h) => h.startsWith("/dashboard"))).toBe(false);
    expect(links).not.toContain("/events");
    expect(links).not.toContain("/admin/members");
  });

  it("conserve chaque lien calculé par le layout (aucune section perdue)", () => {
    const links = hrefs(admin);
    for (const l of [
      ...admin.configLinks,
      ...admin.requestLinks,
      ...admin.mediaLinks,
      ...(admin.agendaLinks ?? []),
      ...(admin.integrationLinks ?? []),
    ]) {
      expect(links).toContain(l.href);
    }
    expect(links).toEqual(
      expect.arrayContaining([
        "/dashboard?dept=d1",
        "/dashboard?dept=d2",
        "/admin/members",
        "/admin/discipleship",
        "/events",
        "/admin/events",
        "/admin/welcome-duty",
        "/admin/reports",
        "/accounting/requests",
        "/rooms",
        "/jobs",
      ])
    );
  });

  it("place le suivi pastoral dans Personnes et l'agenda pastoral dans Agenda", () => {
    const spaces = buildSpaces(admin);
    expect(spaces.find((s) => s.key === "people")?.pages.map((p) => p.href)).toContain("/care");
    const agenda = spaces.find((s) => s.key === "agenda")!;
    expect(agenda.pages.filter((p) => p.group === "Agenda pastoral").map((p) => p.href)).toEqual(["/agenda", "/agenda/schedule"]);
  });

  it("conserve les ancres de visite guidée", () => {
    const spaces = buildSpaces(admin);
    const tours = [...spaces.map((s) => s.dataTour), ...spaces.flatMap((s) => s.pages.map((p) => p.dataTour))].filter(Boolean);
    expect(tours).toEqual(
      expect.arrayContaining([
        "sidebar-planning",
        "sidebar-events",
        "sidebar-members",
        "sidebar-service",
        "sidebar-ressources",
        "sidebar-config",
        "sidebar-reports",
        "sidebar-pastoral",
      ])
    );
  });

  it("un espace dont la seule page est externe (Familles) pointe vers elle", () => {
    const people = buildSpaces(star).find((s) => s.key === "people")!;
    expect(people.external).toBe(true);
    expect(people.href).toBe(FAMILLES);
  });

  it("planning sans département : l'espace reste, avec un message", () => {
    const planning = buildSpaces({ ...deptHead, departments: [], hasAbsences: false }).find((s) => s.key === "planning")!;
    expect(planning.pages).toEqual([]);
    expect(planning.emptyMessage).toBe("Aucun département assigné.");
  });

  it("reporte le compteur des nouvelles offres sur la page et l'espace", () => {
    const resources = buildSpaces({ ...star, jobsUnseenCount: 3 }).find((s) => s.key === "resources")!;
    expect(resources.badge).toBe(3);
    expect(resources.pages.find((p) => p.href === "/jobs")?.badge).toBe(3);
  });

  it("vue pastorale : mêmes entrées que la navigation pastorale actuelle", () => {
    const spaces = buildSpaces({ ...admin, isPastoral: true, homeHref: "/pastoral" });
    const links = spaces.flatMap((s) => s.pages.map((p) => p.href));
    expect(spaces[0].href).toBe("/pastoral");
    expect(links).toEqual(
      expect.arrayContaining(["/pastoral/members", "/pastoral/events", "/pastoral/reports", "/pastoral/accounting", "/events", "/jobs", "/agenda", "/care"])
    );
    expect(links.some((h) => h.startsWith("/dashboard"))).toBe(false);
  });
});

describe("resolveActive", () => {
  const spaces = buildSpaces(admin);

  it("retient la page la plus spécifique", () => {
    expect(resolveActive(spaces, "/admin/departments/functions")).toEqual({ space: "admin", page: "/admin/departments/functions" });
    expect(resolveActive(spaces, "/communication/requests")).toEqual({ space: "media", page: "/media" });
    expect(resolveActive(spaces, "/events/abc/star-view")).toEqual({ space: "agenda", page: "/events" });
    expect(resolveActive(spaces, "/accounting/stats")).toEqual({ space: "requests", page: "/accounting/requests" });
  });

  it("distingue les départements par ?dept", () => {
    expect(resolveActive(spaces, "/dashboard", "d2")).toEqual({ space: "planning", page: "/dashboard?dept=d2" });
    expect(resolveActive(spaces, "/dashboard/stats", null)).toEqual({ space: "planning", page: null });
  });

  it("n'allume pas Mon planning sur les événements STAR", () => {
    expect(resolveActive(buildSpaces(star), "/planning/events")).toEqual({ space: "agenda", page: "/planning/events" });
  });

  it("l'Accueil ne s'allume que si aucune autre page ne correspond", () => {
    expect(resolveActive(buildSpaces(star), "/planning").space).toBe("planning");
    const accountant = buildSpaces({ ...star, hasMyPlanning: false, homeHref: "/profile" });
    expect(resolveActive(accountant, "/profile").space).toBe("home");
    expect(resolveActive(spaces, "/guide")).toEqual({ space: null, page: null });
  });
});

describe("buildBreadcrumb / parentLink", () => {
  const spaces = buildSpaces(admin);

  it("espace › page, puis la sous-page sur une page de détail", () => {
    expect(buildBreadcrumb(spaces, "/admin/departments")).toEqual([
      { label: "Administration", href: "/admin/departments" },
      { label: "Départements" },
    ]);
    expect(buildBreadcrumb(spaces, "/events/e1/star-view")).toEqual([
      { label: "Agenda", href: "/events" },
      { label: "Agenda de l'église", href: "/events" },
      { label: "Planning des STAR" },
    ]);
  });

  it("département : planning › ministère › département", () => {
    expect(buildBreadcrumb(spaces, "/dashboard", "d1")).toEqual([
      { label: "Planning", href: "/dashboard" },
      { label: "Louange" },
      { label: "Choristes" },
    ]);
  });

  it("pages de compte hors espaces", () => {
    expect(buildBreadcrumb(spaces, "/profile")).toEqual([{ label: "Mon profil" }]);
    expect(buildBreadcrumb(spaces, "/profile/notifications")).toEqual([
      { label: "Mon profil", href: "/profile" },
      { label: "Notifications" },
    ]);
  });

  it("retour mobile vers la page parente, jamais sur une page d'espace", () => {
    expect(parentLink(spaces, "/admin/events/e1")).toEqual({ href: "/admin/events", label: "Gérer les événements" });
    expect(parentLink(spaces, "/admin/events")).toBeNull();
    expect(parentLink(spaces, "/dashboard", "d1")).toBeNull();
    expect(parentLink(spaces, "/profile/notifications")).toEqual({ href: "/profile", label: "Mon profil" });
  });
});

describe("bottomDestinations", () => {
  const labels = (input: NavigationInput, role: Parameters<typeof bottomDestinations>[1]["role"]) =>
    bottomDestinations(buildSpaces(input), { role }).map((d) => d.label);

  it("STAR : Mon planning · Agenda · Demandes (l'Accueil mène à la même page que Mon planning)", () => {
    expect(labels(star, "STAR")).toEqual(["Mon planning", "Agenda", "Demandes"]);
  });

  it("Resp. département : Planning · Agenda · Personnes", () => {
    expect(labels(deptHead, "DEPARTMENT_HEAD")).toEqual(["Planning", "Agenda", "Personnes"]);
  });

  it("Admin : Accueil · Agenda · Demandes · Personnes", () => {
    expect(labels({ ...admin, homeHref: "/aujourdhui" }, "ADMIN")).toEqual(["Accueil", "Agenda", "Demandes", "Personnes"]);
  });

  it("n'invente pas de destination : un espace externe seul ou absent est écarté", () => {
    const reporter: NavigationInput = { ...star, hasMyPlanning: false, hasAbsences: false, hasAvailability: false, showStarEvents: false, hasEventsAccess: true, requestLinks: [], homeHref: "/profile" };
    expect(labels(reporter, "REPORTER")).toEqual(["Accueil", "Agenda"]);
  });

  it("Comptable : Accueil · Comptabilité (Demandes n'y mènerait qu'à la même page)", () => {
    const accountant: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], hasAccounting: true, homeHref: "/profile" };
    expect(labels(accountant, "ACCOUNTANT")).toEqual(["Accueil", "Comptabilité"]);
  });

  it("vue pastorale : destinations actuelles", () => {
    const spaces = buildSpaces({ ...admin, isPastoral: true, homeHref: "/pastoral" });
    expect(bottomDestinations(spaces, { role: "ADMIN", isPastoral: true }).map((d) => [d.label, d.href])).toEqual([
      ["Accueil", "/pastoral"],
      ["Mes membres", "/admin/members"],
    ]);
  });

  it("active la destination de l'espace courant", () => {
    const spaces = buildSpaces(deptHead);
    const [planning, agenda] = bottomDestinations(spaces, { role: "DEPARTMENT_HEAD" });
    const active = resolveActive(spaces, "/events/calendar");
    expect(isDestinationActive(agenda, active, "/events/calendar")).toBe(true);
    expect(isDestinationActive(planning, active, "/events/calendar")).toBe(false);
  });
});

describe("recherche de pages", () => {
  it("liste les pages du rôle et les pages de compte, sans doublon", () => {
    const pages = searchablePages(buildSpaces(star));
    const list = pages.map((p) => p.href);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toEqual(expect.arrayContaining(["/planning", "/disponibilites", "/profile", "/guide"]));
  });

  it("ignore accents et casse, classe les débuts de libellé en tête", () => {
    expect(normalizeText("Événements")).toBe("evenements");
    const pages = searchablePages(buildSpaces(admin));
    const hits = filterByQuery(pages, "evene", (p) => `${p.label} ${p.context}`, (p) => p.label).map((p) => p.label);
    expect(hits[0]).toBe("Gérer les événements");
    expect(filterByQuery(pages, "fonctions dep", (p) => p.label, (p) => p.label).map((p) => p.href)).toEqual([
      "/admin/departments/functions",
    ]);
  });
});
