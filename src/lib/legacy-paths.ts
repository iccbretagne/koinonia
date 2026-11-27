/**
 * Anciennes adresses des écrans connectés (spec 092, lot 4, ADR-0033).
 *
 * Table **fixe** ancienne → nouvelle adresse, lue par trois consommateurs :
 *
 * - le proxy (`src/proxy.ts`), qui redirige les anciennes adresses (`GET`/`HEAD` seulement), après
 *   la branche des hôtes de site ;
 * - le script de réécriture des adresses mémorisées (`scripts/092-rewrite-stored-paths.ts`) ;
 * - les effacements par lien (ADR-0019), qui cherchent l'ancienne **et** la nouvelle forme d'un
 *   lien de notification (`legacyAndCurrent`).
 *
 * Sécurité (aucune redirection ouverte, par construction) :
 * - aucun joker : chaque entrée a des segments fixes et des paramètres nommés (`:id`) ;
 * - un paramètre ne correspond qu'à `[A-Za-z0-9_-]{1,64}` — jamais `/`, `\`, `.`, `%` ni espace ;
 * - la cible est un modèle qui commence par un segment littéral : elle ne peut désigner ni une
 *   autre origine (`//x`), ni un schéma ;
 * - le proxy ne change que le `pathname` d'une copie de l'URL de la requête (même origine).
 *
 * Module **pur** (n'importe que `paths.ts`, lui-même pur) : lisible par le proxy et par le script.
 */

import { SCREENS } from "./paths";

export interface LegacyEntry {
  /** Ancienne adresse : segments fixes et paramètres nommés (`/accounting/requests/:id`). */
  readonly from: string;
  /** Nouvelle adresse : mêmes paramètres ; peut porter une requête fixe (`?vue=formulaires`). */
  readonly to: string;
  /**
   * Ancienne adresse secondaire d'une cible qui en a plusieurs (écran supprimé, doublon, ancienne
   * redirection) : jamais choisie par la table inverse.
   */
  readonly alias?: true;
}

/**
 * Carte complète (`specs/092-navigation-par-metier/url-mapping.txt`), plus les anciennes
 * redirections de `next.config.ts` repliées sur leur cible finale (aucune chaîne).
 */
export const LEGACY_PATHS: readonly LegacyEntry[] = [
  // Planning
  { from: "/absences", to: "/planning/disponibilites/equipe" },
  { from: "/dashboard", to: "/planning/departements" },
  { from: "/dashboard/stats", to: "/planning/departements/statistiques" },
  { from: "/disponibilites", to: "/planning/disponibilites" },
  { from: "/disponibilites/collectes", to: "/planning/disponibilites/collectes" },
  { from: "/disponibilites/parametres", to: "/planning/disponibilites/parametres" },
  // Événements (« Calendrier de l'église » : un seul écran, arbitrage de la question ouverte 2)
  { from: "/events", to: "/evenements" },
  { from: "/planning/events", to: "/evenements", alias: true },
  { from: "/events/calendar", to: "/evenements", alias: true },
  { from: "/pastoral/events", to: "/evenements", alias: true },
  { from: "/events/:eventId/star-view", to: "/evenements/:eventId" },
  { from: "/events/announcement-sheets", to: "/evenements/annonces" },
  { from: "/admin/events", to: "/evenements/gestion" },
  { from: "/admin/events/:eventId", to: "/evenements/gestion/:eventId" },
  { from: "/admin/events/:eventId/report", to: "/evenements/comptes-rendus/:eventId" },
  { from: "/admin/reports", to: "/evenements/comptes-rendus" },
  { from: "/pastoral/reports", to: "/evenements/comptes-rendus", alias: true },
  { from: "/admin/welcome-duty", to: "/evenements/service-accueil" },
  { from: "/billetterie", to: "/evenements/billetterie" },
  { from: "/billetterie/:id", to: "/evenements/billetterie/:id" },
  { from: "/billetterie/:id/badges", to: "/evenements/billetterie/:id/badges" },
  { from: "/billetterie/:id/controle", to: "/evenements/billetterie/:id/controle" },
  { from: "/billetterie/:id/etiquettes", to: "/evenements/billetterie/:id/etiquettes" },
  { from: "/billetterie/:id/images", to: "/evenements/billetterie/:id/images" },
  { from: "/billetterie/:id/restauration", to: "/evenements/billetterie/:id/restauration" },
  { from: "/billetterie/mes-reservations", to: "/evenements/mes-inscriptions" },
  { from: "/formulaires", to: "/evenements/formulaires" },
  { from: "/formulaires/:id", to: "/evenements/formulaires/:id" },
  { from: "/formulaires/mes-reponses", to: "/evenements/mes-inscriptions?vue=formulaires" },
  // Pastoral
  { from: "/agenda", to: "/pastoral/agenda" },
  { from: "/agenda/:profileId", to: "/pastoral/agenda/:profileId" },
  { from: "/agenda/new", to: "/pastoral/agenda/nouveau" },
  { from: "/agenda/schedule", to: "/pastoral/planification" },
  { from: "/care", to: "/pastoral/suivi" },
  { from: "/care/followups/:id", to: "/pastoral/suivi/convertis/:id" },
  { from: "/care/parametres", to: "/pastoral/suivi/parametres" },
  { from: "/care/requests/:id", to: "/pastoral/suivi/rendez-vous/:id" },
  { from: "/care/stats", to: "/pastoral/suivi/statistiques" },
  // Ex-`next.config.ts` (spec 052) : qualification des RDV déplacée vers `care`.
  { from: "/agenda/requests", to: "/pastoral/suivi", alias: true },
  { from: "/agenda/requests/:id", to: "/pastoral/suivi", alias: true },
  // Personnes
  { from: "/pastoral/members", to: "/personnes/mes-membres" },
  { from: "/admin/members", to: "/personnes/star" },
  { from: "/admin/members/duplicates", to: "/personnes/star/doublons" },
  { from: "/admin/discipleship", to: "/personnes/discipolat" },
  { from: "/candidatures", to: "/personnes/candidatures" },
  { from: "/candidatures/:id", to: "/personnes/candidatures/:id" },
  { from: "/candidatures/entretiens", to: "/personnes/candidatures/entretiens" },
  { from: "/candidatures/parametres", to: "/personnes/candidatures/parametres" },
  { from: "/candidatures/ma-fiche", to: "/profile/candidature" },
  { from: "/integration/leaders", to: "/personnes/integration/bergers" },
  { from: "/integration/parametres", to: "/personnes/integration/parametres" },
  { from: "/integration/parcours", to: "/personnes/integration/parcours" },
  { from: "/integration/requests", to: "/personnes/integration/dossiers" },
  { from: "/integration/requests/:id", to: "/personnes/integration/dossiers/:id" },
  { from: "/integration/stats", to: "/personnes/integration/stats" },
  // Ex-`next.config.ts` : lien erroné des anciennes notifications d'affectation d'intégration (#629).
  { from: "/admin/integration/requests/:id", to: "/personnes/integration/dossiers/:id", alias: true },
  // Demandes
  { from: "/requests", to: "/demandes" },
  { from: "/requests/:id/edit", to: "/demandes/:id/modifier" },
  { from: "/requests/new", to: "/demandes/nouvelle" },
  { from: "/secretariat/requests", to: "/demandes/traitement" },
  { from: "/care/request", to: "/demandes/rendez-vous" },
  { from: "/agenda/request", to: "/demandes/rendez-vous", alias: true },
  { from: "/collectes", to: "/demandes/questionnaires" },
  { from: "/collectes/:id", to: "/demandes/questionnaires/:id" },
  { from: "/collectes/:id/apercu/:formId", to: "/demandes/questionnaires/:id/apercu/:formId" },
  { from: "/collectes/:id/editer", to: "/demandes/questionnaires/:id/editer" },
  { from: "/collectes/:id/import", to: "/demandes/questionnaires/:id/import" },
  { from: "/collectes/import", to: "/demandes/questionnaires/import" },
  { from: "/collectes/nouvelle", to: "/demandes/questionnaires/nouveau" },
  { from: "/collectes/r/:assignmentId", to: "/demandes/questionnaires/r/:assignmentId" },
  // Finances
  { from: "/accounting/requests", to: "/finances/demandes" },
  { from: "/pastoral/accounting", to: "/finances/demandes", alias: true },
  { from: "/accounting/requests/:id", to: "/finances/demandes/:id" },
  { from: "/accounting/requests/new", to: "/finances/demandes/nouvelle" },
  { from: "/accounting/stats", to: "/finances/statistiques" },
  { from: "/accounting/navette", to: "/finances/navette" },
  { from: "/accounting/tresorerie", to: "/finances/tresorerie" },
  { from: "/dons", to: "/finances/dons" },
  { from: "/dons/slide", to: "/finances/dons/slide" },
  // Médias
  { from: "/media", to: "/medias" },
  { from: "/media/projects", to: "/medias/visuels" },
  { from: "/media/projects/:id", to: "/medias/visuels/:id" },
  { from: "/media/projects/new", to: "/medias/visuels/nouveau" },
  { from: "/media/requests", to: "/medias/visuels/demandes" },
  { from: "/media/collections", to: "/medias/partages" },
  { from: "/media/events", to: "/medias/photos" },
  { from: "/media/events/:id", to: "/medias/photos/:id" },
  { from: "/media/events/new", to: "/medias/photos/nouveau" },
  { from: "/media/galerie", to: "/medias/galerie" },
  { from: "/communication/requests", to: "/medias/reseaux-sociaux" },
  { from: "/audio", to: "/medias/audio" },
  { from: "/audio/ecouter", to: "/medias/audio/ecouter" },
  { from: "/audio/ecouter/:id", to: "/medias/audio/ecouter/:id" },
  { from: "/audio/parametres", to: "/medias/audio/parametres" },
  { from: "/audio/production", to: "/medias/audio/production" },
  { from: "/audio/production/:id", to: "/medias/audio/production/:id" },
  // Ressources
  { from: "/rooms", to: "/ressources/salles" },
  { from: "/rooms/checklists", to: "/ressources/salles/checklists" },
  { from: "/jobs", to: "/ressources/offres" },
  { from: "/admin/jobs", to: "/ressources/offres", alias: true },
  { from: "/jobs/:id", to: "/ressources/offres/:id" },
  { from: "/jobs/:id/edit", to: "/ressources/offres/:id/modifier" },
  { from: "/jobs/new", to: "/ressources/offres/nouveau" },
  { from: "/jobs/freelance/missions/:id", to: "/ressources/offres/freelance/missions/:id" },
  { from: "/jobs/freelance/missions/:id/edit", to: "/ressources/offres/freelance/missions/:id/modifier" },
  { from: "/jobs/freelance/missions/new", to: "/ressources/offres/freelance/missions/nouveau" },
  { from: "/jobs/freelance/profiles/:id", to: "/ressources/offres/freelance/profiles/:id" },
  { from: "/jobs/freelance/profiles/:id/edit", to: "/ressources/offres/freelance/profiles/:id/modifier" },
  { from: "/jobs/freelance/profiles/new", to: "/ressources/offres/freelance/profiles/nouveau" },
  { from: "/jobs/seekers/:id", to: "/ressources/offres/seekers/:id" },
  { from: "/jobs/seekers/:id/edit", to: "/ressources/offres/seekers/:id/modifier" },
  { from: "/jobs/seekers/new", to: "/ressources/offres/seekers/nouveau" },
  // Administration
  { from: "/admin/churches/:churchId", to: "/admin/eglise/:churchId" },
  { from: "/admin/messages/new", to: "/admin/messages/nouveau" },
  { from: "/admin/users/new", to: "/admin/users/nouveau" },
  { from: "/admin/rooms", to: "/admin/salles" },
  // Plateforme
  { from: "/admin/api", to: "/plateforme/api" },
  { from: "/admin/app-icon", to: "/plateforme/app-icon" },
  { from: "/admin/assistant", to: "/plateforme/assistant" },
  { from: "/admin/backups", to: "/plateforme/backups" },
  { from: "/admin/churches", to: "/plateforme/eglises" },
  { from: "/admin/churches/onboard", to: "/plateforme/eglises/nouvelle" },
  { from: "/admin/mcp", to: "/plateforme/mcp" },
  { from: "/admin/site-domains", to: "/plateforme/site-domains" },
];

/** Valeur admise d'un paramètre d'adresse : identifiant (cuid, uuid, slug), jamais un séparateur. */
const PARAM = "[A-Za-z0-9_-]{1,64}";

interface Compiled {
  readonly entry: LegacyEntry;
  readonly regex: RegExp;
  readonly names: readonly string[];
  /** Nombre de segments fixes : le plus spécifique gagne (`/jobs/new` avant `/jobs/:id`). */
  readonly statics: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(pattern: string): { regex: RegExp; names: string[]; statics: number } {
  const names: string[] = [];
  let statics = 0;
  const body = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        names.push(seg.slice(1));
        return `(${PARAM})`;
      }
      if (seg) statics++;
      return escape(seg);
    })
    .join("/");
  return { regex: new RegExp(`^${body}$`), names, statics };
}

function sortBySpecificity<T extends { statics: number }>(list: T[]): T[] {
  return list.sort((a, b) => b.statics - a.statics);
}

const FORWARD: readonly Compiled[] = sortBySpecificity(
  LEGACY_PATHS.map((entry) => ({ entry, ...compile(entry.from) }))
);

/** Cible « chemin + requête fixe » d'un modèle, paramètres substitués. */
function fill(template: string, values: Readonly<Record<string, string>>): { path: string; query: string } {
  const [pathTpl, query = ""] = template.split("?");
  const path = pathTpl.replace(/:([A-Za-z]+)/g, (_, name: string) => values[name]);
  return { path, query };
}

export interface LegacyMatch {
  /** Ancienne adresse reconnue (motif), seule information à journaliser. */
  readonly pattern: string;
  /** Nouveau chemin, paramètres substitués. */
  readonly pathname: string;
  /** Requête fixe de la cible (`vue=formulaires`), sans `?` ; vide le plus souvent. */
  readonly query: string;
}

function matchIn(table: readonly Compiled[], pathname: string): LegacyMatch | null {
  for (const { entry, regex, names } of table) {
    const found = regex.exec(pathname);
    if (!found) continue;
    const values: Record<string, string> = {};
    names.forEach((name, i) => (values[name] = found[i + 1]));
    const { path, query } = fill(entry.to, values);
    return { pattern: entry.from, pathname: path, query };
  }
  return null;
}

/** Nouvelle adresse d'une ancienne adresse d'écran (chemin seul, sans requête), ou `null`. */
export function matchLegacyPath(pathname: string): LegacyMatch | null {
  return matchIn(FORWARD, pathname);
}

/* ── Table inverse (version de secours, `--reverse`, effacements ADR-0019) ───────── */

interface ReverseCompiled extends Compiled {
  /** Requête fixe exigée par l'entrée (`vue=formulaires`). */
  readonly requiredQuery: string;
}

const REVERSE: readonly ReverseCompiled[] = LEGACY_PATHS.filter((e) => !e.alias)
  .map((entry) => {
    const [toPath, requiredQuery = ""] = entry.to.split("?");
    return { entry: { from: entry.to, to: entry.from }, requiredQuery, ...compile(toPath) };
  })
  // Requête fixe d'abord, puis le plus spécifique.
  .sort((a, b) => Number(!!b.requiredQuery) - Number(!!a.requiredQuery) || b.statics - a.statics);

/** Ancienne adresse d'une nouvelle (chemin + requête éventuelle), ou `null`. */
export function reverseLegacyPath(pathname: string, query = ""): LegacyMatch | null {
  const params = new URLSearchParams(query);
  for (const { entry, regex, names, requiredQuery } of REVERSE) {
    if (requiredQuery) {
      const required = new URLSearchParams(requiredQuery);
      if ([...required].some(([k, v]) => params.get(k) !== v)) continue;
    }
    const found = regex.exec(pathname);
    if (!found) continue;
    const values: Record<string, string> = {};
    names.forEach((name, i) => (values[name] = found[i + 1]));
    const { path } = fill(entry.to, values);
    // La requête fixe de la nouvelle forme disparaît dans l'ancienne.
    const rest = new URLSearchParams(query);
    for (const [k] of new URLSearchParams(requiredQuery)) rest.delete(k);
    return { pattern: entry.from, pathname: path, query: rest.toString() };
  }
  return null;
}

/* ── Liens complets (adresses mémorisées) ────────────────────────────────────── */

type Direction = "forward" | "reverse";

function splitHref(href: string): { path: string; query: string; hash: string } {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const rest = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = rest.indexOf("?");
  return { path: qAt >= 0 ? rest.slice(0, qAt) : rest, query: qAt >= 0 ? rest.slice(qAt + 1) : "", hash };
}

function mergeQuery(base: string, fixed: string): string {
  if (!fixed) return base;
  const params = new URLSearchParams(base);
  for (const [k, v] of new URLSearchParams(fixed)) params.set(k, v);
  return params.toString();
}

function rewriteRelative(href: string, direction: Direction): string | null {
  // Seulement une adresse relative à la racine : jamais `//hôte`, ni `/\hôte`.
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\")) return null;
  const { path, query, hash } = splitHref(href);
  const match = direction === "forward" ? matchLegacyPath(path) : reverseLegacyPath(path, query);
  if (!match) return null;
  const q = direction === "forward" ? mergeQuery(query, match.query) : match.query;
  return match.pathname + (q ? `?${q}` : "") + hash;
}

/**
 * Lien mémorisé réécrit (relatif `/…`, ou absolu vers `appOrigin` seulement), ou `null` s'il n'a
 * pas à changer. Une adresse d'une autre origine, un `mailto:` ou un lien déjà à jour ne sont
 * jamais modifiés.
 */
export function rewriteStoredHref(href: string, direction: Direction, appOrigin?: string | null): string | null {
  if (href.startsWith("/")) return rewriteRelative(href, direction);
  if (!appOrigin) return null;
  let url: URL;
  let origin: string;
  try {
    url = new URL(href);
    origin = new URL(appOrigin).origin;
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const relative = rewriteRelative(url.pathname + url.search + url.hash, direction);
  return relative === null ? null : origin + relative;
}

/* ── Préfixes des écrans d'aide de l'assistant (`AssistantEntry.screens`) ──────── */

/**
 * Anciens préfixes qui n'étaient pas eux-mêmes un écran (segments partagés) : leur nouvelle
 * couverture, écran par écran. Les autres préfixes se déduisent de la table principale.
 */
export const LEGACY_SCREEN_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  "/accounting": ["/finances/demandes", "/finances/statistiques", "/finances/navette", "/finances/tresorerie"],
  "/communication": ["/medias/reseaux-sociaux"],
  "/integration": ["/personnes/integration"],
  "/secretariat": ["/demandes/traitement"],
};

const REVERSE_SCREEN_PREFIXES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_SCREEN_PREFIXES)
    .filter(([, to]) => to.length === 1)
    .map(([from, [to]]) => [to, from])
);

/** Préfixe d'écran sans paramètre : `/x/:id/y` → `/x`. */
const stem = (pattern: string) => pattern.split("/:")[0].split("?")[0];

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

function minimal(prefixes: readonly string[]): string[] {
  const unique = [...new Set(prefixes)];
  return unique.filter((p) => !unique.some((q) => q !== p && isUnder(p, q))).sort((a, b) => a.localeCompare(b));
}

const CURRENT_SCREENS: readonly string[] = Object.values(SCREENS);

/**
 * Nouveaux préfixes d'un préfixe d'aide (`screens`) : mêmes écrans qu'avant. Un préfixe déjà à
 * jour revient tel quel (idempotence). `reverse` rend l'ancienne forme pour la table inverse.
 */
export function rewriteScreenPrefix(prefix: string, direction: Direction = "forward"): string[] {
  if (direction === "reverse") {
    if (REVERSE_SCREEN_PREFIXES[prefix]) return [REVERSE_SCREEN_PREFIXES[prefix]];
    const back = reverseLegacyPath(prefix);
    return [back ? back.pathname : prefix];
  }
  if (LEGACY_SCREEN_PREFIXES[prefix]) return [...LEGACY_SCREEN_PREFIXES[prefix]];
  const exact = matchLegacyPath(prefix);
  // Ancienne adresse d'un écran : sa nouvelle adresse, et les écrans qu'elle couvrait.
  const covered = LEGACY_PATHS.filter((e) => !e.alias && e.from !== prefix && isUnder(e.from, prefix)).map((e) => stem(e.to));
  if (!exact && covered.length === 0) return [prefix];
  const result = [...covered];
  if (exact) result.push(exact.pathname);
  // Le préfixe reste valable s'il couvre encore un écran actuel (`/pastoral`, `/admin`).
  if (!exact && CURRENT_SCREENS.some((s) => isUnder(s, prefix))) result.push(prefix);
  return minimal(result);
}

/* ── Effacements par lien (ADR-0019) ─────────────────────────────────────────── */

/** Toutes les entrées (alias compris) dont la cible est un chemin sans requête fixe. */
const ALL_SOURCES: readonly (Compiled & { readonly from: string })[] = LEGACY_PATHS.filter((e) => !e.to.includes("?"))
  .map((entry) => ({ entry, from: entry.from, ...compile(entry.to) }))
  // Un alias dont l'ancienne forme porte un paramètre absent de la cible n'est pas reconstructible.
  .filter(({ from, names }) => (from.match(/:([A-Za-z]+)/g) ?? []).every((p) => names.includes(p.slice(1))));

/**
 * Forme actuelle et anciennes formes (alias compris) d'un lien d'écran relatif, pour retrouver
 * les notifications créées avant la réécriture des adresses mémorisées (intervalle déploiement →
 * script). Toujours la forme actuelle en premier. À retirer au lot 5.
 */
export function legacyAndCurrent(href: string): string[] {
  const out = [href];
  const add = (h: string | null) => {
    if (h && !out.includes(h)) out.push(h);
  };
  add(rewriteStoredHref(href, "reverse"));
  const { path, query, hash } = splitHref(href);
  if (!query && !hash) {
    for (const { regex, names, from } of ALL_SOURCES) {
      const found = regex.exec(path);
      if (!found) continue;
      const values: Record<string, string> = {};
      names.forEach((name, i) => (values[name] = found[i + 1]));
      add(fill(from, values).path);
    }
  }
  return out;
}

/** Forme actuelle d'un lien mémorisé (ancienne adresse réécrite, sinon inchangé). */
export function currentHref(href: string): string {
  return rewriteStoredHref(href, "forward") ?? href;
}
