import {
  BookOpen,
  Download,
  Calendar,
  CalendarCheck,
  HeartHandshake,
  House,
  Image,
  Inbox,
  LayoutGrid,
  Package,
  Server,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { matchesPath } from "./nav-match";
import type { RoleKey } from "./tour-steps";
import { paths, PREFIXES, SCREEN_META, screenOf, screenPath, type ScreenKey, type SpaceId } from "@/lib/paths";

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
export const TODAY_HREF: string | null = paths.accueil();

/** Les onze espaces (spec 092, ADR-0033), dans l'ordre d'affichage. */
export type SpaceKey = Exclude<SpaceId, "account">;

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
  /** Candidatures au service (spec 077) : équipe PVS, Admin, ou département qui en suit une. */
  readonly servingLinks?: readonly Link[];
  readonly famillesUrl?: string | null;
  readonly hasDiscipleship?: boolean;
  readonly hasEventsAccess?: boolean;
  readonly hasEventsManage?: boolean;
  readonly hasPlanningAccess?: boolean;
  readonly hasMembersAccess?: boolean;
  readonly hasReports?: boolean;
  readonly hasMyPlanning?: boolean;
  readonly showStarEvents?: boolean;
  /** « Trame des annonces » : droit de lecture réel (`canReadAnnouncementSheet`, #676). */
  readonly hasAnnouncementSheet?: boolean;
  readonly hasAbsences?: boolean;
  /** « Disponibilités » : tout compte lié à une fiche STAR (spec 058). */
  readonly hasAvailability?: boolean;
  readonly hasRooms?: boolean;
  /** `accounting:view` : le Ministre et le Resp. département passent par « Mes demandes ». */
  readonly hasAccounting?: boolean;
  /** `accounting:manage` : « Demandes comptables » dans Finances. */
  readonly hasAccountingManage?: boolean;
  /** `accounting:stats` : « Statistiques » dans Finances. */
  readonly hasAccountingStats?: boolean;
  /** Réservations de billetterie / réponses à des formulaires de la personne (Événements › Mes inscriptions). */
  readonly myRegistrations?: { readonly reservations: boolean; readonly responses: boolean };
  /** Registre de la navette (spec 073), rangé dans Finances. */
  readonly hasShuttle?: boolean;
  /** Trésorerie de l'église (spec 076), rangée dans Finances : `treasury:manage`. */
  readonly hasTreasury?: boolean;
  /** Billetterie (spec 074) : `ticketing:manage` ou un rôle sur un événement actif. */
  readonly hasTicketing?: boolean;
  /** Formulaires (spec 079, 085) : `forms:manage`, intervenant ou accès délégué dans l'église courante. */
  readonly hasForms?: boolean;
  /** Collectes (spec 090) : `campaigns:manage`, gestionnaire d'une campagne ou répondant d'une affectation. */
  readonly hasCampaigns?: boolean;
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
  if (isPastoral) return paths.pastoral();
  if (TODAY_HREF) return TODAY_HREF;
  if (hasPlanningAccess) return paths.dashboard();
  if (hasStarPlanning) return paths.planning();
  return paths.profile();
}

const CARE_HREF = paths.care();

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

/** Pastoral : agenda des pasteurs (module agenda) et suivi pastoral (module care), dans l'ordre du layout. */
function pastoralPagesFor(input: NavigationInput): NavPage[] {
  return (input.agendaLinks ?? []).map((l) => ({ href: l.href, label: l.label }));
}

function jobsPage(input: NavigationInput): NavPage {
  return {
    href: paths.jobs(),
    label: "Offres",
    matchPrefixes: [paths.jobs(), paths.admin.jobs()],
    badge: input.jobsUnseenCount && input.jobsUnseenCount > 0 ? input.jobsUnseenCount : undefined,
  };
}

/** Pages réservées à la plateforme (Super Admin) : espace Plateforme, jamais Administration. */
const PLATFORM_HREFS: ReadonlySet<string> = new Set([
  paths.admin.churches(),
  paths.admin.backups(),
  paths.admin.api(),
  paths.admin.appIcon(),
  paths.admin.siteDomains(),
  paths.admin.assistant(),
  paths.admin.mcp(),
]);

/** Blocs de l'espace Administration (sidebar desktop), dans l'ordre d'affichage. */
const ADMIN_BLOCK_ORDER = ["Église", "Accès", "Communication", "Suivi"] as const;
const ADMIN_BLOCKS: Record<string, (typeof ADMIN_BLOCK_ORDER)[number]> = {
  [paths.admin.ministries()]: "Église",
  [paths.admin.departments()]: "Église",
  [paths.admin.departmentFunctions()]: "Église",
  [paths.admin.rooms()]: "Église",
  [paths.admin.users()]: "Accès",
  [paths.admin.access()]: "Accès",
  [paths.admin.pastoralProfiles()]: "Accès",
  [paths.admin.messages()]: "Communication",
  [paths.admin.auditLogs()]: "Suivi",
};

/**
 * Répartit les liens de `configLinks` du layout : Plateforme (Super Admin), Finances (page de dons)
 * et Administration (réglages de l'église, rangés par bloc). Ce module ne filtre rien : un lien
 * absent du layout reste absent.
 */
function splitConfig(input: NavigationInput) {
  const platform: NavPage[] = [];
  const giving: NavPage[] = [];
  const admin: NavPage[] = [];
  for (const l of input.configLinks) {
    if (PLATFORM_HREFS.has(l.href)) platform.push({ href: l.href, label: l.label });
    else if (l.href === paths.dons()) giving.push({ href: l.href, label: l.label });
    else {
      // Paramètres de l'église : `/admin/churches/<id>`.
      const block = ADMIN_BLOCKS[l.href] ?? (l.href.startsWith(`${paths.admin.churches()}/`) ? "Église" : undefined);
      admin.push({ href: l.href, label: l.label, sidebarBlock: block });
    }
  }
  const rank = (p: NavPage) => {
    const i = ADMIN_BLOCK_ORDER.indexOf(p.sidebarBlock as (typeof ADMIN_BLOCK_ORDER)[number]);
    return i === -1 ? ADMIN_BLOCK_ORDER.length : i;
  };
  return { platform, giving, admin: admin.toSorted((a, b) => rank(a) - rank(b)) };
}

/** Libellés des pages d'intégration sous l'intitulé « Intégration » de la sidebar desktop. */
const INTEGRATION_SHORT_LABELS: Record<string, string> = {
  [paths.integration.requests()]: "Dossiers",
  [paths.integration.parcours()]: "Parcours",
  [paths.integration.stats()]: "Statistiques",
  [paths.integration.parametres()]: "Paramètres",
};

/** Finances : demandes comptables, statistiques, navette, trésorerie, page de dons. */
function financePagesFor(input: NavigationInput, giving: NavPage[]): NavPage[] {
  const pages: NavPage[] = [];
  // Seul le Comptable (et l'administration) traite les demandes : le Ministre et le Resp.
  // département (accounting:view sans manage) passent par « Mes demandes ».
  if (input.hasAccountingManage) {
    pages.push({ href: paths.accounting.requests(), label: "Demandes comptables", matchPrefixes: [PREFIXES.accounting] });
  }
  if (input.hasAccountingStats) pages.push({ href: paths.accounting.stats(), label: "Statistiques" });
  if (input.hasShuttle) pages.push({ href: paths.accounting.navette(), label: "Navette" });
  if (input.hasTreasury) pages.push({ href: paths.accounting.tresorerie(), label: "Trésorerie" });
  pages.push(...giving);
  return pages;
}

/** Vue pastorale : navigation simplifiée, mêmes écrans qu'avant, rangés dans les espaces communs (lot 3 : filtre). */
function buildPastoralSpaces(input: NavigationInput): NavSpace[] {
  const { platform, giving, admin } = splitConfig(input);
  const spaces = [
    homeSpace(input.homeHref),
    space("events", "Événements", Calendar, "service", [
      { href: paths.pastoral.events(), label: "Événements pastoraux" },
      ...(input.hasEventsAccess ? [{ href: paths.events(), label: "Calendrier de l'église" }] : []),
      { href: paths.pastoral.reports(), label: "Comptes rendus" },
    ]),
    space("pastoral", "Pastoral", HeartHandshake, "service", pastoralPagesFor(input)),
    space("people", "Personnes", Users, "service", [
      { href: paths.pastoral.members(), label: "Mes membres" },
      ...(input.hasDiscipleship ? [{ href: paths.admin.discipleship(), label: "Discipolat" }] : []),
    ]),
    space("requests", "Demandes", Inbox, "service", input.hasCampaigns ? [{ href: paths.collectes(), label: "Questionnaires" }] : []),
    space("finances", "Finances", Wallet, "service", [{ href: paths.pastoral.accounting(), label: "Demandes comptables" }, ...giving]),
    space("resources", "Ressources", Package, "church", input.hasJobs ? [jobsPage(input)] : []),
    space("admin", "Administration", Settings, "church", admin),
    space("platform", "Plateforme", Server, "church", platform),
  ];
  return spaces.filter((s): s is NavSpace => s !== null);
}

function planningPagesFor(input: NavigationInput): NavPage[] {
  const pages: NavPage[] = [];
  if (input.hasMyPlanning) pages.push({ href: paths.planning(), label: "Mon planning" });
  // Une seule entrée : « Disponibilités » (réponses du STAR), ou la vue d'ensemble pour qui n'a pas de fiche liée.
  // Les deux écrans se rejoignent par des onglets (AvailabilityTabs).
  if (input.hasAvailability) pages.push({ href: paths.disponibilites(), label: "Disponibilités" });
  else if (input.hasAbsences) pages.push({ href: paths.absences(), label: "Disponibilités" });
  if (input.hasPlanningAccess) {
    for (const d of input.departments) {
      pages.push({ href: paths.dashboard({ dept: d.id }), label: d.name, deptId: d.id, group: d.ministryName || undefined });
    }
  }
  return pages;
}

/** Événements : pages de l'église, puis inscriptions (billetterie, formulaires, Mes inscriptions). */
function eventsPagesFor(input: NavigationInput): NavPage[] {
  const events: NavPage[] = [];
  const church = "Église";
  // STAR sans events:view : vue hebdomadaire (spec 043).
  if (input.showStarEvents) {
    events.push({ href: paths.planning.events(), label: "Calendrier de l'église", sidebarBlock: church });
  }
  if (input.hasEventsAccess) {
    events.push({ href: paths.events(), label: "Calendrier de l'église", sidebarBlock: church });
    if (input.hasEventsManage) {
      events.push(
        { href: paths.admin.events(), label: "Gérer les événements", sidebarBlock: church },
        { href: paths.admin.welcomeDuty(), label: "Service d'accueil", sidebarBlock: church },
      );
    }
    if (input.hasReports) {
      events.push({ href: paths.admin.reports(), label: "Comptes rendus", dataTour: "sidebar-reports", sidebarBlock: church });
    }
  }
  // Trame des annonces : seulement avec le droit de lecture effectif (#676) — ni events:view
  // (Reporter) ni planning:view seul (STAR hors modération) ne suffisent.
  if (input.hasAnnouncementSheet) {
    events.push({ href: paths.events.announcementSheets(), label: "Trame des annonces", sidebarBlock: church });
  }
  // Inscriptions : billetterie, formulaires, et les inscriptions de la personne.
  const signups = "Inscriptions";
  if (input.hasTicketing) {
    events.push({ href: paths.billetterie(), label: "Billetterie", sidebarBlock: signups });
  }
  if (input.hasForms) {
    events.push({ href: paths.formulaires(), label: "Formulaires", sidebarBlock: signups });
  }
  const mine = input.myRegistrations;
  if (mine?.reservations || mine?.responses) {
    events.push({
      href: mine.reservations ? paths.billetterie.mesReservations() : paths.formulaires.mesReponses(),
      label: "Mes inscriptions",
      matchPrefixes: [paths.billetterie.mesReservations(), paths.formulaires.mesReponses()],
      sidebarBlock: signups,
    });
  }
  return events;
}

function peoplePagesFor(input: NavigationInput): NavPage[] {
  const people: NavPage[] = [];
  if (input.hasMembersAccess) people.push({ href: paths.admin.members(), label: "STAR" });
  if (input.hasDiscipleship) people.push({ href: paths.admin.discipleship(), label: "Discipolat" });
  for (const l of input.servingLinks ?? []) people.push({ href: l.href, label: l.label });
  for (const l of input.integrationLinks ?? []) {
    people.push({ href: l.href, label: l.label, sidebarBlock: "Intégration", sidebarLabel: INTEGRATION_SHORT_LABELS[l.href] });
  }
  return people;
}

function requestPagesFor(input: NavigationInput): NavPage[] {
  const requests: NavPage[] = input.requestLinks.map((l) => ({ href: l.href, label: l.label }));
  // Collectes (spec 090) : questionnaires à remplir ou à piloter, là où répondants et responsables
  // vont déjà (barre du bas).
  if (input.hasCampaigns) requests.push({ href: paths.collectes(), label: "Questionnaires" });
  return requests;
}

/** Ressources : salles, offres (une seule entrée) et Familles (site externe, visible pour tous). */
function resourcePagesFor(input: NavigationInput): NavPage[] {
  const resources: NavPage[] = [];
  if (input.hasRooms) resources.push({ href: paths.rooms(), label: "Salles" });
  if (input.hasJobs) resources.push(jobsPage(input));
  if (input.famillesUrl) resources.push({ href: input.famillesUrl, label: "Familles", external: true });
  return resources;
}

/**
 * Les espaces du rôle, dans l'ordre de `10-navigation.md` : Accueil, Planning, Événements,
 * Pastoral, Personnes, Demandes, Finances, Médias, Ressources, Administration, Plateforme. Un
 * espace sans page n'apparaît pas.
 */
export function buildSpaces(input: NavigationInput): NavSpace[] {
  if (input.isPastoral) return buildPastoralSpaces(input);

  const { platform, giving, admin } = splitConfig(input);
  const media: NavPage[] = input.mediaLinks.map((l) => ({
    href: l.href,
    label: l.label,
    matchPrefixes: l.matchPrefixes,
  }));

  const spaces = [
    homeSpace(input.homeHref),
    space("planning", "Planning", LayoutGrid, "service", planningPagesFor(input), {
      dataTour: "sidebar-planning",
      // La grille par département (/dashboard) redirige vers le premier département.
      href: input.hasPlanningAccess && input.departments.length > 0 ? paths.dashboard() : undefined,
      emptyMessage: input.hasPlanningAccess ? "Aucun département assigné." : undefined,
    }),
    space("events", "Événements", Calendar, "service", eventsPagesFor(input), { dataTour: "sidebar-events" }),
    space("pastoral", "Pastoral", HeartHandshake, "service", pastoralPagesFor(input), { dataTour: "sidebar-pastoral" }),
    space("people", "Personnes", Users, "service", peoplePagesFor(input), { dataTour: "sidebar-members" }),
    space("requests", "Demandes", Inbox, "service", requestPagesFor(input), { dataTour: "sidebar-service" }),
    space("finances", "Finances", Wallet, "service", financePagesFor(input, giving)),
    space("media", "Médias", Image, "church", media),
    space("resources", "Ressources", Package, "church", resourcePagesFor(input), { dataTour: "sidebar-ressources" }),
    space("admin", "Administration", Settings, "church", admin, { dataTour: "sidebar-config" }),
    space("platform", "Plateforme", Server, "church", platform),
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
    return matchesPath(pathname, paths.dashboard()) && dept === page.deptId ? paths.dashboard().length + 1000 : null;
  }
  const lengths = pagePrefixes(page).filter((prefix) => matchesPath(pathname, prefix)).map((prefix) => prefix.length);
  return lengths.length > 0 ? Math.max(...lengths) : null;
}

/** Écran du service à remplacer (spec 061), sans entrée de navigation propre. */
const REPLACEMENT_PATH = PREFIXES.planningRemplacements;
const REPLACEMENT_LABEL = "Remplacement";

/** Page de navigation la plus spécifique qui couvre l'adresse (par préfixe), avec son espace. */
function matchBest(
  spaces: readonly NavSpace[],
  pathname: string,
  dept: string | null
): { space: NavSpace; page: NavPage } | null {
  let best: { space: NavSpace; page: NavPage; len: number } | null = null;
  for (const s of spaces) {
    for (const p of s.pages) {
      const len = matchLength(p, pathname, dept);
      if (len !== null && (!best || len > best.len)) best = { space: s, page: p, len };
    }
  }
  return best;
}

/* Parenté (registre `SCREEN_META`) : chaîne de parents d'un écran, adresses reconstruites avec les
   segments dynamiques de l'écran courant. */

interface ScreenRef {
  readonly key: ScreenKey;
  readonly params: Readonly<Record<string, string>>;
}

interface ParentRef extends ScreenRef {
  readonly path: string;
}

function parentsOf(ref: ScreenRef): ParentRef[] {
  const parent = SCREEN_META[ref.key].parent;
  if (!parent) return [];
  const out: ParentRef[] = [];
  for (const key of Array.isArray(parent) ? (parent as readonly ScreenKey[]) : [parent as ScreenKey]) {
    const path = screenPath(key, ref.params);
    if (path) out.push({ key, params: ref.params, path });
  }
  return out;
}

/** Premier ancêtre (en remontant les parents du registre) pour lequel `visit` répond, ou `null`. */
function walkAncestors<T>(ref: ScreenRef, visit: (parent: ParentRef) => T | null, depth = 0): T | null {
  if (depth > 8) return null;
  const parents = parentsOf(ref);
  for (const p of parents) {
    const hit = visit(p);
    if (hit !== null) return hit;
  }
  for (const p of parents) {
    const hit = walkAncestors(p, visit, depth + 1);
    if (hit !== null) return hit;
  }
  return null;
}

/**
 * Espace et page actifs pour l'URL courante : la page la plus spécifique l'emporte parmi toutes
 * celles de la navigation (`/planning/events` n'allume pas « Mon planning »). Les départements
 * partagent `/dashboard` et se distinguent par `?dept`. Un écran que la navigation ne liste pas
 * (événement vu par un STAR, demande comptable d'un Ministre…) allume celui de son plus proche
 * parent présent. L'Accueil ne s'allume que si aucune page d'un autre espace ne correspond (il
 * peut pointer vers la même URL qu'une autre entrée).
 */
export function resolveActive(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): ActiveNav {
  // Service à remplacer (spec 061) : atteint par lien seulement, rattaché à l'espace Planning.
  if (matchesPath(pathname, REPLACEMENT_PATH) && spaces.some((s) => s.key === "planning")) {
    return { space: "planning", page: null };
  }

  const best = matchBest(spaces, pathname, dept);
  if (best) return { space: best.space.key, page: best.page.href };

  const ref = screenOf(pathname);
  if (ref) {
    const viaParent = walkAncestors(ref, (p) => {
      const hit = matchBest(spaces, p.path, dept);
      return hit ? ({ space: hit.space.key, page: hit.page.href } as ActiveNav) : null;
    });
    if (viaParent) return viaParent;
  }

  // Grille de planning sans département choisi (ou hors de la liste) : l'espace reste actif.
  const planning = spaces.find((s) => s.key === "planning");
  if (planning && planning.pages.some((p) => p.deptId) && matchesPath(pathname, paths.dashboard())) {
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
  { href: paths.profile(), label: "Mon profil", icon: UserRound },
  { href: paths.guide(), label: "Guide d'utilisation", icon: BookOpen },
];

/**
 * Page d'installation (spec 070), proposée par la recherche. Hors `ACCOUNT_PAGES` : le menu du
 * compte l'affiche par une ligne contextuelle, selon l'appareil.
 */
export const INSTALL_PAGE = { href: "/installer", label: "Installer l'application", icon: Download } as const;

/**
 * Libellé de l'écran courant : celui du registre (`SCREEN_META`), « Détail » pour une adresse que
 * le registre ne connaît pas (`navigation-subpages.test.ts` vérifie qu'aucune page ne s'y réduit).
 */
function currentLabel(pathname: string): string {
  const ref = screenOf(pathname);
  return ref ? SCREEN_META[ref.key].label : "Détail";
}

function findPage(spaces: readonly NavSpace[], active: ActiveNav): { space: NavSpace; page: NavPage | null } | null {
  const s = spaces.find((sp) => sp.key === active.space);
  if (!s) return null;
  return { space: s, page: active.page ? (s.pages.find((p) => p.href === active.page) ?? null) : null };
}

/** Le chemin courant descend-il sous la page de navigation (page de détail) ? */
function isDeeper(pathname: string, page: NavPage): boolean {
  // Page de département : seule la grille `/dashboard` lui correspond, ses statistiques sont plus bas.
  if (page.deptId) return pathOf(pathname) !== paths.dashboard();
  return !pagePrefixes(page).includes(pathname) && pathname !== pathOf(page.href);
}

/** Adresse que la personne peut suivre vers un parent : une page de navigation ou une page de compte. */
function coverOf(spaces: readonly NavSpace[], path: string, dept: string | null) {
  const hit = matchBest(spaces, path, dept);
  if (hit) return { href: isDeeper(path, hit.page) ? path : hit.page.href, exact: !isDeeper(path, hit.page), label: undefined as string | undefined, page: hit.page };
  const account = ACCOUNT_PAGES.find((a) => pathOf(path) === a.href);
  if (account) return { href: account.href, exact: true, label: account.label, page: null };
  return null;
}

/**
 * Fil d'Ariane desktop : espace › (groupe) › page › parents › écran. Le dernier segment n'a pas
 * de lien. Les parents viennent du registre, jamais d'une heuristique sur l'adresse.
 */
export function buildBreadcrumb(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): Crumb[] {
  const active = resolveActive(spaces, pathname, dept);
  const found = findPage(spaces, active);
  const ref = screenOf(pathname);

  if (!found) {
    const account = ACCOUNT_PAGES.find((p) => matchesPath(pathname, p.href));
    if (!account) return ref && SCREEN_META[ref.key].space === "account" ? [{ label: SCREEN_META[ref.key].label }] : [];
    if (pathname === account.href) return [{ label: account.label }];
    return [{ label: account.label, href: account.href }, { label: currentLabel(pathname) }];
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
  if (deeper) {
    // Écrans intermédiaires entre la page de navigation et l'écran courant (événement › badges).
    const mids: Crumb[] = [];
    let node: ScreenRef | null = ref;
    for (let depth = 0; node && depth < 8; depth++) {
      const parents: ParentRef[] = parentsOf(node);
      if (parents.length === 0) break;
      const hit = parents.find((p) => coverOf(spaces, p.path, dept));
      const next: ParentRef = hit ?? parents[0];
      const cover = hit ? coverOf(spaces, hit.path, dept) : null;
      if (cover?.exact) break;
      if (hit) mids.unshift({ label: SCREEN_META[hit.key].label, href: hit.path });
      node = next;
    }
    crumbs.push(...mids, { label: currentLabel(pathname) });
  }
  return crumbs;
}

/**
 * Retour mobile : le parent réel de l'écran (chaîne de parents du registre), ou `null` sur une
 * page d'espace. Il ne ramène jamais à l'Accueil par défaut : seuls les écrans déclarés `orHome`
 * (message de l'administration, mes inscriptions) y retombent quand aucun de leurs parents
 * n'est dans la navigation de la personne. Pas dans l'historique, pour qu'un lien reçu par
 * notification ramène au bon endroit.
 */
export function parentLink(spaces: readonly NavSpace[], pathname: string, dept: string | null = null): { href: string; label: string } | null {
  const ref = screenOf(pathname);
  const own = coverOf(spaces, pathname, dept);
  // Page d'espace ou page de compte de premier niveau : pas de retour.
  if (own?.exact) return null;
  if (!ref) return own && !own.exact && own.page ? { href: own.page.href, label: own.page.label } : null;
  if (matchesPath(pathname, REPLACEMENT_PATH) && spaces.some((s) => s.key === "planning")) {
    const planning = spaces.find((s) => s.key === "planning")!;
    return { href: planning.href, label: planning.label };
  }

  const viaChain = walkAncestors(ref, (p) => {
    const cover = coverOf(spaces, p.path, dept);
    if (!cover) return null;
    // Page de navigation : son libellé de menu ; écran intermédiaire (événement…) : celui du registre.
    return { href: cover.href, label: cover.exact ? (cover.page?.label ?? cover.label ?? SCREEN_META[p.key].label) : SCREEN_META[p.key].label };
  });
  if (viaChain) return viaChain;

  // Vue pastorale (lot 3) : ses écrans reviennent à l'accueil pastoral, comme avant.
  if (pathname.startsWith(`${paths.pastoral()}/`)) return { href: paths.pastoral(), label: "Accueil" };

  const orHome = [ref, ...collectAncestors(ref)].some((r) => SCREEN_META[r.key].orHome);
  return orHome ? { href: TODAY_HREF ?? paths.accueil(), label: "Accueil" } : null;
}

function collectAncestors(ref: ScreenRef): ScreenRef[] {
  const out: ScreenRef[] = [];
  walkAncestors<never>(ref, (p) => {
    out.push(p);
    return null;
  });
  return out;
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

type Candidate = "home" | "myPlanning" | "planning" | "events" | "people" | "requests" | "care" | "accounting";

/** Priorités de `10-navigation.md`, par rôle principal dans l'église courante. */
const ROLE_PRIORITIES: Partial<Record<RoleKey, Candidate[]>> = {
  STAR: ["home", "myPlanning", "events", "requests"],
  DEPARTMENT_HEAD: ["home", "planning", "events", "people"],
  MINISTER: ["home", "planning", "events", "people"],
  SECRETARY: ["home", "events", "requests", "people"],
  ADMIN: ["home", "events", "requests", "people"],
  SUPER_ADMIN: ["home", "events", "requests", "people"],
  PASTORAL_CARE_REFERENT: ["home", "care", "people", "events"],
  ACCOUNTANT: ["home", "accounting", "requests"],
};

/** Rôles sans ligne dans le tableau (Reporter, Faiseur de disciples) : premières sections réelles. */
const DEFAULT_PRIORITIES: Candidate[] = ["home", "myPlanning", "planning", "events", "people", "requests"];

function candidate(spaces: readonly NavSpace[], c: Candidate): BottomDestination | null {
  const bySpace = (key: SpaceKey) => spaces.find((s) => s.key === key && !s.external && s.pages.some((p) => !p.external));
  const pageIn = (key: SpaceKey, href: string) => spaces.find((s) => s.key === key)?.pages.find((p) => p.href === href);

  switch (c) {
    case "home": {
      const home = spaces.find((s) => s.key === "home");
      return home ? { key: "home", label: "Accueil", href: home.href, icon: House, space: "home" } : null;
    }
    case "myPlanning": {
      const p = pageIn("planning", paths.planning());
      return p ? { key: "myPlanning", label: "Mon planning", href: p.href, icon: CalendarCheck, prefixes: [] } : null;
    }
    case "care": {
      const p = pageIn("pastoral", CARE_HREF);
      return p ? { key: "care", label: "Suivi", href: p.href, icon: HeartHandshake, prefixes: [CARE_HREF] } : null;
    }
    case "accounting": {
      const p = pageIn("finances", paths.accounting.requests());
      return p ? { key: "accounting", label: "Demandes comptables", href: p.href, icon: Wallet, prefixes: [PREFIXES.accounting] } : null;
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
      { key: "home", label: "Accueil", href: home?.href ?? paths.pastoral(), icon: House, space: "home" },
      { key: "members", label: "Mes membres", href: paths.pastoral.members(), icon: Users, prefixes: [paths.pastoral.members()] },
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
  add({ href: INSTALL_PAGE.href, label: INSTALL_PAGE.label, context: "Compte", icon: INSTALL_PAGE.icon });
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
