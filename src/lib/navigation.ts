import {
  BookOpen,
  Calendar,
  CalendarCheck,
  HeartHandshake,
  House,
  Image,
  Inbox,
  LayoutGrid,
  Package,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { matchesPath } from "./nav-match";
import type { RoleKey } from "./tour-steps";

/**
 * Entrées de navigation de l'espace authentifié (spec 055, lot 3 — docs/design-system/guidelines/
 * 10-navigation.md) : **une seule définition**, construite à partir des sections que
 * `(auth)/layout.tsx` calcule déjà (mêmes conditions `has*`, mêmes listes de liens), et partagée
 * par la sidebar, la barre du bas, le panneau « Plus », le fil d'Ariane et la palette de recherche.
 *
 * Ce module ne décide d'aucun droit : il ne fait que regrouper en espaces ce que le layout a déjà
 * autorisé. Un rôle n'y gagne ni n'y perd aucune section. La protection réelle reste côté serveur.
 */

/**
 * URL de la future page « Aujourd'hui » (accueil commun à tous les rôles). Tant qu'elle vaut
 * `null`, l'espace Accueil pointe vers la page d'accueil actuelle du rôle (`landingHref`, même
 * logique que `defaultLandingPage` de `src/app/page.tsx`). La renseigner suffit à basculer
 * sidebar, barre du bas, panneau « Plus » et palette.
 */
export const TODAY_HREF: string | null = "/accueil";

export type SpaceKey = "home" | "planning" | "agenda" | "people" | "requests" | "media" | "resources" | "admin";

export interface NavPage {
  readonly href: string;
  readonly label: string;
  /** Préfixes de routes supplémentaires qui allument cette page (`/media` couvre `/communication`). */
  readonly matchPrefixes?: readonly string[];
  /** Lien externe (Familles) : nouvel onglet, jamais « actif ». */
  readonly external?: boolean;
  /** Département de la grille de planning (`/dashboard?dept=…`) : actif selon `?dept`. */
  readonly deptId?: string;
  /** Sous-groupe d'affichage (ministère d'un département, « Agenda pastoral », « Intégration »). */
  readonly group?: string;
  readonly badge?: number;
  /** Ancre de la visite guidée (`src/lib/tour-steps.ts`). */
  readonly dataTour?: string;
  /**
   * Bloc de la sidebar desktop (« Église », « Intégration », « Organisation »…), à défaut de
   * `group`. Lu seulement par `sidebarBlocks` : le panneau « Plus » mobile n'en tient pas compte.
   */
  readonly sidebarBlock?: string;
  /** Libellé raccourci sous l'intitulé de son bloc dans la sidebar desktop (« Parcours »). */
  readonly sidebarLabel?: string;
}

export interface NavSpace {
  readonly key: SpaceKey;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Destination de l'espace : sa première page interne (ou le lien externe s'il n'a que lui). */
  readonly href: string;
  readonly external?: boolean;
  readonly pages: readonly NavPage[];
  /** Intitulé `overline` de la sidebar sous lequel l'espace se range. */
  readonly section: "service" | "church";
  readonly dataTour?: string;
  /** Compteur de l'espace (somme des compteurs de ses pages). */
  readonly badge?: number;
  /** Message affiché à la place des pages quand l'espace n'en a aucune (planning sans département). */
  readonly emptyMessage?: string;
}

export const SECTION_LABELS: Record<NavSpace["section"], string> = {
  service: "Mon service",
  church: "Église",
};

interface Link {
  readonly href: string;
  readonly label: string;
  readonly matchPrefixes?: string[];
}

/** Sections calculées par `(auth)/layout.tsx`, telles qu'il les passe à `AuthLayoutShell`. */
export interface NavigationInput {
  readonly departments: readonly { id: string; name: string; ministryName?: string }[];
  readonly configLinks: readonly Link[];
  readonly requestLinks: readonly Link[];
  readonly mediaLinks: readonly Link[];
  readonly agendaLinks?: readonly Link[];
  readonly integrationLinks?: readonly Link[];
  readonly famillesUrl?: string | null;
  readonly hasDiscipleship?: boolean;
  readonly hasEventsAccess?: boolean;
  readonly hasEventsManage?: boolean;
  readonly hasPlanningAccess?: boolean;
  readonly hasMembersAccess?: boolean;
  readonly hasReports?: boolean;
  readonly hasMyPlanning?: boolean;
  readonly showStarEvents?: boolean;
  readonly hasAbsences?: boolean;
  /** « Disponibilités » : tout compte lié à une fiche STAR (spec 058). */
  readonly hasAvailability?: boolean;
  readonly hasRooms?: boolean;
  readonly hasAccounting?: boolean;
  readonly hasJobs?: boolean;
  /** Vue pastorale active (cookie `koinonia-view-mode`). */
  readonly isPastoral?: boolean;
  /** Page d'accueil du rôle (`landingHref`). */
  readonly homeHref: string;
  readonly jobsUnseenCount?: number;
}

/**
 * Page d'accueil actuelle d'un rôle — même logique que `defaultLandingPage` (`src/app/page.tsx`) :
 * `/dashboard` exige `planning:department`, `/planning` `planning:view`, `/profile` sinon. La vue
 * pastorale a son propre accueil. `TODAY_HREF`, une fois renseignée, prend le pas pour tous.
 */
export function landingHref({
  isPastoral,
  hasPlanningAccess,
  hasStarPlanning,
}: {
  readonly isPastoral: boolean;
  readonly hasPlanningAccess: boolean;
  readonly hasStarPlanning: boolean;
}): string {
  if (isPastoral) return "/pastoral";
  if (TODAY_HREF) return TODAY_HREF;
  if (hasPlanningAccess) return "/dashboard";
  if (hasStarPlanning) return "/planning";
  return "/profile";
}

const CARE_HREF = "/care";

function space(
  key: SpaceKey,
  label: string,
  icon: LucideIcon,
  section: NavSpace["section"],
  pages: NavPage[],
  extra: Partial<Pick<NavSpace, "dataTour" | "emptyMessage" | "href">> = {}
): NavSpace | null {
  if (pages.length === 0 && !extra.emptyMessage) return null;
  const firstInternal = pages.find((p) => !p.external);
  const href = extra.href ?? firstInternal?.href ?? pages[0]?.href ?? "/";
  const badge = pages.reduce((sum, p) => sum + (p.badge ?? 0), 0);
  return {
    key,
    label,
    icon,
    section,
    pages,
    href,
    external: !extra.href && !firstInternal && pages.length > 0,
    badge: badge > 0 ? badge : undefined,
    dataTour: extra.dataTour,
    emptyMessage: pages.length === 0 ? extra.emptyMessage : undefined,
  };
}

function homeSpace(href: string): NavSpace {
  return { key: "home", label: "Accueil", icon: House, section: "service", href, pages: [] };
}

/** « Suivi pastoral » (module care) vit dans Personnes ; le reste de l'agenda pastoral dans Agenda. */
function splitAgendaLinks(agendaLinks: readonly Link[]) {
  const care = agendaLinks.filter((l) => l.href === CARE_HREF);
  const agenda = agendaLinks.filter((l) => l.href !== CARE_HREF);
  return { care, agenda };
}

/** Ancre « sidebar-pastoral » : sur « Suivi pastoral » s'il existe, sinon sur l'agenda pastoral. */
function pastoralPages(input: NavigationInput) {
  const { care, agenda } = splitAgendaLinks(input.agendaLinks ?? []);
  const carePages: NavPage[] = care.map((l) => ({ href: l.href, label: l.label, dataTour: "sidebar-pastoral" }));
  const agendaPages: NavPage[] = agenda.map((l, i) => ({
    href: l.href,
    label: l.label,
    group: "Agenda pastoral",
    dataTour: care.length === 0 && i === 0 ? "sidebar-pastoral" : undefined,
  }));
  return { carePages, agendaPages };
}

function jobsPage(input: NavigationInput): NavPage {
  return {
    href: "/jobs",
    label: "Offres",
    matchPrefixes: ["/jobs", "/admin/jobs"],
    badge: input.jobsUnseenCount && input.jobsUnseenCount > 0 ? input.jobsUnseenCount : undefined,
  };
}

/** Blocs de l'espace Administration dans la sidebar desktop. */
const CONFIG_BLOCKS: Record<string, string> = {
  "/admin/churches": "Organisation",
  "/admin/ministries": "Organisation",
  "/admin/departments": "Organisation",
  "/admin/departments/functions": "Organisation",
  "/admin/rooms": "Organisation",
  "/admin/users": "Accès",
  "/admin/access": "Accès",
  "/admin/pastoral-profiles": "Accès",
  "/admin/audit-logs": "Plateforme",
  "/admin/backups": "Plateforme",
};

function configPages(input: NavigationInput): NavPage[] {
  return input.configLinks.map((l) => ({
    href: l.href,
    label: l.label,
    // Paramètres de l'église d'un Admin : `/admin/churches/<id>`
    sidebarBlock: CONFIG_BLOCKS[l.href] ?? (l.href.startsWith("/admin/churches/") ? "Organisation" : undefined),
  }));
}

/** Libellés des pages d'intégration sous l'intitulé « Intégration » de la sidebar desktop. */
const INTEGRATION_SHORT_LABELS: Record<string, string> = {
  "/integration/requests": "Demandes",
  "/integration/parcours": "Parcours",
  "/integration/stats": "Statistiques",
  "/integration/parametres": "Paramètres",
};

/** Vue pastorale : navigation simplifiée, mêmes entrées que la sidebar et le menu mobile actuels. */
function buildPastoralSpaces(input: NavigationInput): NavSpace[] {
  const { carePages, agendaPages } = pastoralPages(input);
  const spaces = [
    homeSpace(input.homeHref),
    space("people", "Personnes", Users, "service", [
      { href: "/pastoral/members", label: "Mes membres" },
      ...(input.hasDiscipleship ? [{ href: "/admin/discipleship", label: "Discipolat" }] : []),
      ...carePages,
    ]),
    space("agenda", "Agenda", Calendar, "service", [
      { href: "/pastoral/events", label: "Événements" },
      ...(input.hasEventsAccess ? [{ href: "/events", label: "Agenda de l'église" }] : []),
      { href: "/pastoral/reports", label: "Comptes rendus" },
      ...agendaPages,
    ]),
    space("requests", "Demandes", Inbox, "service", [{ href: "/pastoral/accounting", label: "Comptabilité" }]),
    space("resources", "Ressources", Package, "church", input.hasJobs ? [jobsPage(input)] : []),
    space("admin", "Administration", Settings, "church", configPages(input)),
  ];
  return spaces.filter((s): s is NavSpace => s !== null);
}

function planningPagesFor(input: NavigationInput): NavPage[] {
  const pages: NavPage[] = [];
  if (input.hasMyPlanning) pages.push({ href: "/planning", label: "Mon planning" });
  // Une seule entrée : « Disponibilités » (réponses du STAR), ou la vue d'ensemble pour qui n'a pas de fiche liée.
  // Les deux écrans se rejoignent par des onglets (AvailabilityTabs).
  if (input.hasAvailability) pages.push({ href: "/disponibilites", label: "Disponibilités" });
  else if (input.hasAbsences) pages.push({ href: "/absences", label: "Disponibilités" });
  if (input.hasPlanningAccess) {
    for (const d of input.departments) {
      pages.push({ href: `/dashboard?dept=${d.id}`, label: d.name, deptId: d.id, group: d.ministryName || undefined });
    }
  }
  return pages;
}

function agendaPagesFor(input: NavigationInput, agendaPages: NavPage[]): NavPage[] {
  const agenda: NavPage[] = [];
  // Pages de l'église : bloc « Église » de la sidebar desktop, face à « Agenda pastoral ».
  const church = "Église";
  // STAR sans events:view : vue hebdomadaire + trame des annonces (spec 043).
  if (input.showStarEvents) {
    agenda.push(
      { href: "/planning/events", label: "Agenda de l'église", sidebarBlock: church },
      { href: "/events/announcement-sheets", label: "Trame des annonces", sidebarBlock: church },
    );
  }
  if (input.hasEventsAccess) {
    agenda.push(
      { href: "/events", label: "Agenda de l'église", sidebarBlock: church },
      { href: "/events/announcement-sheets", label: "Trame des annonces", sidebarBlock: church },
    );
    if (input.hasEventsManage) {
      agenda.push(
        { href: "/admin/events", label: "Gérer les événements", sidebarBlock: church },
        { href: "/admin/welcome-duty", label: "Service d'accueil", sidebarBlock: church },
      );
    }
    if (input.hasReports) {
      agenda.push({ href: "/admin/reports", label: "Comptes rendus", dataTour: "sidebar-reports", sidebarBlock: church });
    }
  }
  agenda.push(...agendaPages);
  return agenda;
}

function peoplePagesFor(input: NavigationInput, carePages: NavPage[]): NavPage[] {
  const people: NavPage[] = [];
  if (input.hasMembersAccess) people.push({ href: "/admin/members", label: "STAR" });
  if (input.hasDiscipleship) people.push({ href: "/admin/discipleship", label: "Discipolat" });
  for (const l of input.integrationLinks ?? []) {
    people.push({ href: l.href, label: l.label, sidebarBlock: "Intégration", sidebarLabel: INTEGRATION_SHORT_LABELS[l.href] });
  }
  people.push(...carePages);
  if (input.famillesUrl) people.push({ href: input.famillesUrl, label: "Familles", external: true });
  return people;
}

function requestPagesFor(input: NavigationInput): NavPage[] {
  const requests: NavPage[] = input.requestLinks.map((l) => ({ href: l.href, label: l.label }));
  if (input.hasAccounting) {
    requests.push({ href: "/accounting/requests", label: "Comptabilité", matchPrefixes: ["/accounting"] });
  }
  return requests;
}

function resourcePagesFor(input: NavigationInput): NavPage[] {
  const resources: NavPage[] = [];
  if (input.hasRooms) resources.push({ href: "/rooms", label: "Salles" });
  if (input.hasJobs) resources.push(jobsPage(input));
  return resources;
}

/**
 * Les espaces du rôle, dans l'ordre de `10-navigation.md` : Accueil, Planning, Agenda, Personnes,
 * Demandes, Médias, Ressources, Administration. Un espace sans page n'apparaît pas.
 */
export function buildSpaces(input: NavigationInput): NavSpace[] {
  if (input.isPastoral) return buildPastoralSpaces(input);

  const { carePages, agendaPages } = pastoralPages(input);
  const planningPages = planningPagesFor(input);
  const agenda = agendaPagesFor(input, agendaPages);
  const people = peoplePagesFor(input, carePages);
  const requests = requestPagesFor(input);
  const media: NavPage[] = input.mediaLinks.map((l) => ({
    href: l.href,
    label: l.label,
    matchPrefixes: l.matchPrefixes,
  }));
  const resources = resourcePagesFor(input);

  const spaces = [
    homeSpace(input.homeHref),
    space("planning", "Planning", LayoutGrid, "service", planningPages, {
      dataTour: "sidebar-planning",
      // La grille par département (/dashboard) redirige vers le premier département.
      href: input.hasPlanningAccess && input.departments.length > 0 ? "/dashboard" : undefined,
      emptyMessage: input.hasPlanningAccess ? "Aucun département assigné." : undefined,
    }),
    space("agenda", "Agenda", Calendar, "service", agenda, { dataTour: "sidebar-events" }),
    space("people", "Personnes", Users, "service", people, { dataTour: "sidebar-members" }),
    space("requests", "Demandes", Inbox, "service", requests, { dataTour: "sidebar-service" }),
    space("media", "Médias", Image, "church", media),
    space("resources", "Ressources", Package, "church", resources, { dataTour: "sidebar-ressources" }),
    space("admin", "Administration", Settings, "church", configPages(input), { dataTour: "sidebar-config" }),
  ];
  return spaces.filter((s): s is NavSpace => s !== null);
}

/* ── Sidebar desktop : blocs d'un espace ─────────────────────────────────────── */

export interface SidebarEntry {
  readonly page: NavPage;
  /** Libellé affiché : raccourci (`sidebarLabel`) seulement sous l'intitulé de son bloc. */
  readonly label: string;
}

export interface SidebarMinistry {
  readonly name: string;
  readonly entries: readonly SidebarEntry[];
}

export interface SidebarBlock {
  /** Intitulé du bloc (séparateur « libellé + filet ») ; `null` : pages sans intitulé. */
  readonly label: string | null;
  /** Nombre de départements (bloc « Départements » seulement). */
  readonly count?: number;
  /** Pages hors ministère, dans l'ordre. */
  readonly entries: readonly SidebarEntry[];
  /** Départements rangés par ministère repliable (plusieurs ministères dans le bloc). */
  readonly ministries: readonly SidebarMinistry[];
}

const DEPARTMENTS_BLOCK = "Départements";

function blockOf(page: NavPage): string | null {
  if (page.sidebarBlock) return page.sidebarBlock;
  if (page.deptId) return DEPARTMENTS_BLOCK;
  return page.group ?? null;
}

/** Regroupe des éléments consécutifs selon une clé, dans l'ordre. */
function runs<T, K>(items: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
  const out: { key: K; items: T[] }[] = [];
  for (const item of items) {
    const k = key(item);
    const last = out.at(-1);
    if (last?.key === k) last.items.push(item);
    else out.push({ key: k, items: [item] });
  }
  return out;
}

/**
 * Arborescence des pages d'un espace dans la sidebar desktop (spec 055, retours sur le menu) :
 * pages sans intitulé, puis blocs à intitulé (« Départements », « Agenda pastoral »…). Le bloc
 * « Départements » range ses départements par ministère repliable ; avec un seul ministère, il
 * le nomme dans son intitulé (« Départements · Louange ») et liste les départements directement.
 * Un espace réduit à un seul bloc (hors départements) n'affiche pas d'intitulé : il ne
 * distinguerait rien. Le panneau « Plus » mobile garde sa propre présentation (`group`).
 */
export function sidebarBlocks(pages: readonly NavPage[]): SidebarBlock[] {
  const groups = runs(pages, blockOf);
  const single = groups.length === 1 && groups[0].key !== null && groups[0].key !== DEPARTMENTS_BLOCK;

  return groups.map(({ key, items }) => {
    const label = single ? null : key;
    const entry = (page: NavPage): SidebarEntry => ({
      page,
      label: label !== null && page.sidebarLabel ? page.sidebarLabel : page.label,
    });
    if (key !== DEPARTMENTS_BLOCK) return { label, entries: items.map(entry), ministries: [] };

    const named = [...new Set(items.map((p) => p.group).filter((g): g is string => !!g))];
    if (named.length <= 1) {
      const onlyNamed = named.length === 1 && items.every((p) => p.group === named[0]);
      return {
        label: onlyNamed ? `${DEPARTMENTS_BLOCK} · ${named[0]}` : DEPARTMENTS_BLOCK,
        count: items.length,
        entries: items.map(entry),
        ministries: [],
      };
    }
    const byMinistry = runs(items, (p) => p.group ?? null);
    return {
      label: DEPARTMENTS_BLOCK,
      count: items.length,
      entries: byMinistry.filter((m) => m.key === null).flatMap((m) => m.items.map(entry)),
      ministries: byMinistry
        .filter((m): m is { key: string; items: NavPage[] } => m.key !== null)
        .map((m) => ({ name: m.key, entries: m.items.map(entry) })),
    };
  });
}

/* ── Page active ───────────────────────────────────────────────────────────── */

export interface ActiveNav {
  readonly space: SpaceKey | null;
  /** `href` de la page active (le plus spécifique), ou `null`. */
  readonly page: string | null;
}

function pathOf(href: string): string {
  return href.split("?")[0];
}

function pagePrefixes(page: NavPage): readonly string[] {
  return page.matchPrefixes && page.matchPrefixes.length > 0 ? page.matchPrefixes : [pathOf(page.href)];
}

/**
 * Longueur du préfixe par lequel une page correspond à l'URL (la plus longue l'emporte), ou
 * `null`. Une page de département ne correspond qu'à `/dashboard` avec son `?dept`, et prime
 * alors sur tout préfixe.
 */
function matchLength(page: NavPage, pathname: string, dept: string | null): number | null {
  if (page.external) return null;
  if (page.deptId) {
    return matchesPath(pathname, "/dashboard") && dept === page.deptId ? "/dashboard".length + 1000 : null;
  }
  const lengths = pagePrefixes(page).filter((prefix) => matchesPath(pathname, prefix)).map((prefix) => prefix.length);
  return lengths.length > 0 ? Math.max(...lengths) : null;
}

/** Écran du service à remplacer (spec 061), sans entrée de navigation propre. */
const REPLACEMENT_PATH = "/planning/remplacements";
const REPLACEMENT_LABEL = "Remplacement";

/**
 * Espace et page actifs pour l'URL courante : la page la plus spécifique l'emporte parmi toutes
 * celles de la navigation (`/planning/events` n'allume pas « Mon planning »). Les départements
 * partagent `/dashboard` et se distinguent par `?dept`. L'Accueil ne s'allume que si aucune page
 * d'un autre espace ne correspond (il peut pointer vers la même URL qu'une autre entrée).
 */
export function resolveActive(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): ActiveNav {
  // Service à remplacer (spec 061) : atteint par lien seulement, rattaché à l'espace Planning.
  if (matchesPath(pathname, REPLACEMENT_PATH) && spaces.some((s) => s.key === "planning")) {
    return { space: "planning", page: null };
  }

  let best: { space: SpaceKey; page: string; len: number } | null = null;

  for (const s of spaces) {
    for (const p of s.pages) {
      const len = matchLength(p, pathname, dept);
      if (len !== null && (!best || len > best.len)) best = { space: s.key, page: p.href, len };
    }
  }
  if (best) return { space: best.space, page: best.page };

  // Grille de planning sans département choisi (ou hors de la liste) : l'espace reste actif.
  const planning = spaces.find((s) => s.key === "planning");
  if (planning && planning.pages.some((p) => p.deptId) && matchesPath(pathname, "/dashboard")) {
    return { space: "planning", page: null };
  }

  const home = spaces.find((s) => s.key === "home");
  if (home && matchesPath(pathname, pathOf(home.href))) return { space: "home", page: null };

  return { space: null, page: null };
}

/* ── Fil d'Ariane et retour ───────────────────────────────────────────────── */

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/** Pages de compte, hors espaces : présentes dans le menu compte et la palette. */
export const ACCOUNT_PAGES: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/profile", label: "Mon profil", icon: UserRound },
  { href: "/guide", label: "Guide d'utilisation", icon: BookOpen },
];

/** Libellé du dernier segment d'une sous-page que la navigation ne nomme pas. */
const SUBPAGE_LABELS: Record<string, string> = {
  "star-view": "Planning des STAR",
  calendar: "Calendrier",
  new: "Nouveau",
  edit: "Modification",
  stats: "Statistiques",
  report: "Compte rendu",
  duplicates: "Doublons",
  parametres: "Paramètres",
  settings: "Paramètres",
  ecouter: "(re)Écouter",
  production: "Production",
  events: "Photos",
  projects: "Projets",
  requests: "Demandes",
  notifications: "Notifications",
  functions: "Fonctions",
};

function subpageLabel(pathname: string): string {
  const last = pathname.split("/").findLast(Boolean) ?? "";
  return SUBPAGE_LABELS[last] ?? "Détail";
}

function findPage(spaces: readonly NavSpace[], active: ActiveNav): { space: NavSpace; page: NavPage | null } | null {
  const s = spaces.find((sp) => sp.key === active.space);
  if (!s) return null;
  return { space: s, page: active.page ? (s.pages.find((p) => p.href === active.page) ?? null) : null };
}

/** Le chemin courant descend-il sous la page de navigation (page de détail) ? */
function isDeeper(pathname: string, page: NavPage): boolean {
  if (page.deptId) return false;
  return !pagePrefixes(page).includes(pathname) && pathname !== pathOf(page.href);
}

/**
 * Fil d'Ariane desktop : espace › (groupe) › page › sous-page. Le dernier segment n'a pas de lien.
 */
export function buildBreadcrumb(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): Crumb[] {
  const active = resolveActive(spaces, pathname, dept);
  const found = findPage(spaces, active);

  if (!found) {
    const account = ACCOUNT_PAGES.find((p) => matchesPath(pathname, p.href));
    if (!account) return [];
    if (pathname === account.href) return [{ label: account.label }];
    return [{ label: account.label, href: account.href }, { label: subpageLabel(pathname) }];
  }

  const { space: s, page } = found;
  if (s.key === "home") return [{ label: s.label }];
  if (s.key === "planning" && matchesPath(pathname, REPLACEMENT_PATH)) {
    return [{ label: s.label, href: s.external ? undefined : s.href }, { label: REPLACEMENT_LABEL }];
  }
  if (!page) return [{ label: s.label }];

  const deeper = isDeeper(pathname, page);
  const crumbs: Crumb[] = [];
  const spaceIsPage = pathOf(s.href) === pathOf(page.href) && s.pages.length === 1;
  if (!spaceIsPage) crumbs.push({ label: s.label, href: s.external ? undefined : s.href });
  if (page.group && page.deptId) crumbs.push({ label: page.group });
  crumbs.push(deeper ? { label: page.label, href: page.href } : { label: page.label });
  if (deeper) crumbs.push({ label: subpageLabel(pathname) });
  return crumbs;
}

/**
 * Retour mobile : sur une page de détail (plus profonde que la page de navigation qui la couvre),
 * remonte d'un niveau dans l'arborescence — pas dans l'historique, pour qu'un lien reçu par
 * notification ramène au bon endroit. `null` sur une page d'espace.
 */
export function parentLink(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): { href: string; label: string } | null {
  const active = resolveActive(spaces, pathname, dept);
  const found = findPage(spaces, active);
  if (!found) {
    const account = ACCOUNT_PAGES.find((p) => matchesPath(pathname, p.href) && pathname !== p.href);
    return account ? { href: account.href, label: account.label } : null;
  }
  const { page } = found;
  if (found.space.key === "planning" && matchesPath(pathname, REPLACEMENT_PATH)) {
    return { href: found.space.href, label: found.space.label };
  }
  if (!page || !isDeeper(pathname, page)) return null;
  return { href: page.href, label: page.label };
}

/* ── Barre du bas ─────────────────────────────────────────────────────────── */

export interface BottomDestination {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Espace couvert : la destination est active sur toutes ses pages. */
  readonly space?: SpaceKey;
  /** Préfixes de routes qui l'allument (destination de page). */
  readonly prefixes?: readonly string[];
  readonly badge?: number;
}

type Candidate = "home" | "myPlanning" | "planning" | "agenda" | "people" | "requests" | "care" | "accounting";

/** Priorités de `10-navigation.md`, par rôle principal dans l'église courante. */
const ROLE_PRIORITIES: Partial<Record<RoleKey, Candidate[]>> = {
  STAR: ["home", "myPlanning", "agenda", "requests"],
  DEPARTMENT_HEAD: ["home", "planning", "agenda", "people"],
  MINISTER: ["home", "planning", "agenda", "people"],
  SECRETARY: ["home", "agenda", "requests", "people"],
  ADMIN: ["home", "agenda", "requests", "people"],
  SUPER_ADMIN: ["home", "agenda", "requests", "people"],
  PASTORAL_CARE_REFERENT: ["home", "care", "people", "agenda"],
  ACCOUNTANT: ["home", "accounting", "requests"],
};

/** Rôles sans ligne dans le tableau (Reporter, Faiseur de disciples) : premières sections réelles. */
const DEFAULT_PRIORITIES: Candidate[] = ["home", "myPlanning", "planning", "agenda", "people", "requests"];

function candidate(spaces: readonly NavSpace[], c: Candidate): BottomDestination | null {
  const bySpace = (key: SpaceKey) => spaces.find((s) => s.key === key && !s.external && s.pages.some((p) => !p.external));
  const pageIn = (key: SpaceKey, href: string) => spaces.find((s) => s.key === key)?.pages.find((p) => p.href === href);

  switch (c) {
    case "home": {
      const home = spaces.find((s) => s.key === "home");
      return home ? { key: "home", label: "Accueil", href: home.href, icon: House, space: "home" } : null;
    }
    case "myPlanning": {
      const p = pageIn("planning", "/planning");
      return p ? { key: "myPlanning", label: "Mon planning", href: p.href, icon: CalendarCheck, prefixes: [] } : null;
    }
    case "care": {
      const p = pageIn("people", CARE_HREF);
      return p ? { key: "care", label: "Suivi", href: p.href, icon: HeartHandshake, prefixes: [CARE_HREF] } : null;
    }
    case "accounting": {
      const p = pageIn("requests", "/accounting/requests");
      return p ? { key: "accounting", label: "Comptabilité", href: p.href, icon: Wallet, prefixes: ["/accounting"] } : null;
    }
    default: {
      const s = bySpace(c);
      if (!s) return null;
      return { key: c, label: s.label, href: s.href, icon: s.icon, space: s.key, badge: s.badge };
    }
  }
}

/**
 * Au plus quatre destinations adaptées au rôle, avant « Plus ». Seules les sections réellement
 * accessibles sont retenues ; une destination qui mènerait à la même URL qu'une autre déjà
 * retenue (l'Accueil tant que la page « Aujourd'hui » n'existe pas) est écartée plutôt que
 * doublée. Aucune destination n'est inventée pour compléter.
 */
export function bottomDestinations(
  spaces: readonly NavSpace[],
  { role, isPastoral }: { readonly role: RoleKey; readonly isPastoral?: boolean }
): BottomDestination[] {
  if (isPastoral) {
    // Vue pastorale : destinations actuelles (accueil pastoral + membres).
    const home = spaces.find((s) => s.key === "home");
    return [
      { key: "home", label: "Accueil", href: home?.href ?? "/pastoral", icon: House, space: "home" },
      { key: "members", label: "Mes membres", href: "/admin/members", icon: Users, prefixes: ["/admin/members"] },
    ];
  }

  const order = ROLE_PRIORITIES[role] ?? DEFAULT_PRIORITIES;
  const picked: BottomDestination[] = [];
  for (const c of order) {
    const d = candidate(spaces, c);
    if (!d) continue;
    const duplicate = picked.some((p) => pathOf(p.href) === pathOf(d.href));
    if (duplicate) continue;
    // L'Accueil qui ne mène qu'à une page déjà couverte par une destination suivante est écarté.
    if (c === "home" && order.some((o) => o !== "home" && candidate(spaces, o) && pathOf(candidate(spaces, o)!.href) === pathOf(d.href))) {
      continue;
    }
    picked.push(d);
    if (picked.length === 4) break;
  }
  return picked;
}

/** La destination est-elle active pour la page courante ? */
export function isDestinationActive(d: BottomDestination, active: ActiveNav, pathname: string): boolean {
  if (d.space) return active.space === d.space;
  if (active.page === d.href) return true;
  return (d.prefixes ?? []).some((p) => matchesPath(pathname, p));
}

/* ── Palette de recherche ─────────────────────────────────────────────────── */

export interface SearchablePage {
  readonly href: string;
  readonly label: string;
  /** Contexte affiché sous le libellé (« Planning · Louange »). */
  readonly context: string;
  readonly icon: LucideIcon;
  readonly external?: boolean;
}

/** Toutes les pages de la navigation du rôle, à plat, plus les pages de compte. */
export function searchablePages(spaces: readonly NavSpace[]): SearchablePage[] {
  const out: SearchablePage[] = [];
  const seen = new Set<string>();
  const add = (p: SearchablePage) => {
    if (seen.has(p.href)) return;
    seen.add(p.href);
    out.push(p);
  };
  for (const s of spaces) {
    if (s.key === "home") add({ href: s.href, label: "Accueil", context: "Page d'accueil", icon: s.icon });
    for (const p of s.pages) {
      add({
        href: p.href,
        label: p.label,
        context: p.group ? `${s.label} · ${p.group}` : s.label,
        icon: s.icon,
        external: p.external,
      });
    }
  }
  for (const a of ACCOUNT_PAGES) add({ href: a.href, label: a.label, context: "Compte", icon: a.icon });
  return out;
}

/** Minuscules sans accents, pour une recherche tolérante (« evenement » trouve « Événements »). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Filtre et classe des éléments sur une saisie : chaque mot saisi doit apparaître dans le texte
 * de l'élément ; les libellés qui commencent par la saisie passent devant.
 */
export function filterByQuery<T>(items: readonly T[], query: string, text: (item: T) => string, primary: (item: T) => string): T[] {
  const q = normalizeText(query);
  if (!q) return [...items];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const hay = normalizeText(text(item));
    if (!tokens.every((t) => hay.includes(t))) return;
    const label = normalizeText(primary(item));
    let score = 2;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s'’-]+/).some((w) => w.startsWith(tokens[0]))) score = 1;
    scored.push({ item, score, index });
  });
  return scored.toSorted((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}
