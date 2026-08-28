/**
 * Filtrage, tri et persistance intra-session de la file Production audio (spec 023).
 *
 * Fonctions pures (sans React) : `AudioQueueClient` ne fait que câbler l'état de
 * l'utilisateur à ces helpers puis afficher le résultat. Couvert par
 * `queue-filters.test.ts`.
 */

import { normalizeText } from "@/lib/text";

export type AudioServiceStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "READY"
  | "PUBLISHED"
  | "UNPUBLISHED";

/** Une ligne de la file, telle que fournie par `page.tsx`. */
export interface AudioServiceRow {
  id: string;
  title: string | null;
  speaker: string | null;
  series: string | null;
  serviceDate: string; // ISO
  status: AudioServiceStatus;
  type: string;
  openCount: number;
  segmentCount: number;
  eventTitle: string | null;
}

export type SortKey = "date" | "status" | "segments" | "opens";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export interface QueueCriteria {
  status: string; // "" = tous, sinon un AudioServiceStatus
  type: string; // "" = tous, sinon une valeur de type
  year: string; // "" ou "AAAA"
  from: string; // "" ou "AAAA-MM-JJ"
  to: string; // "" ou "AAAA-MM-JJ"
  text: string; // recherche libre (titre + orateur)
  speaker: string; // "" = tous, NO_SPEAKER = sans orateur, sinon nom exact
  series: string; // "" = toutes, NO_SERIES = sans série, sinon nom exact
}

/** Valeur du filtre orateur isolant les enregistrements sans orateur renseigné. */
export const NO_SPEAKER = "__NONE__";

/** Valeur du filtre série isolant les enregistrements hors série. */
export const NO_SERIES = "__NONE__";

export const EMPTY_CRITERIA: QueueCriteria = {
  status: "",
  type: "",
  year: "",
  from: "",
  to: "",
  text: "",
  speaker: "",
  series: "",
};

export const DEFAULT_SORT: SortState = { key: "date", dir: "desc" };

/**
 * Ordre du tri par statut (décision spec) : ce qui demande une action d'abord,
 * ce qui est terminé ensuite.
 */
export const STATUS_SORT_ORDER: Record<AudioServiceStatus, number> = {
  PENDING_REVIEW: 0,
  READY: 1,
  DRAFT: 2,
  PUBLISHED: 3,
  UNPUBLISHED: 4,
};

/** `true` si des critères ou un tri non-défaut sont actifs (bouton Réinitialiser). */
export function hasActiveState(criteria: QueueCriteria, sort: SortState): boolean {
  const filtersActive = (Object.keys(EMPTY_CRITERIA) as (keyof QueueCriteria)[]).some(
    (k) => criteria[k] !== EMPTY_CRITERIA[k]
  );
  const sortActive = sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir;
  return filtersActive || sortActive;
}

/**
 * Orateurs présents dans la file : non vides, dédoublonnés (casse/accents ignorés
 * pour l'unicité, première graphie conservée), triés `fr`.
 */
export function deriveSpeakers(rows: AudioServiceRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const raw = row.speaker?.trim();
    if (!raw) continue;
    const key = normalizeText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Séries distinctes présentes dans la file (dédupliquées sur forme normalisée), triées `fr`. */
export function deriveSeries(rows: AudioServiceRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const raw = row.series?.trim();
    if (!raw) continue;
    const key = normalizeText(raw);
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Années distinctes présentes dans la file, décroissantes. */
export function deriveYears(rows: AudioServiceRow[]): string[] {
  const years = new Set<string>();
  for (const row of rows) {
    const y = row.serviceDate.slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

/** `false` si `from` et `to` sont tous deux renseignés et `from > to`. */
export function isRangeValid(c: QueueCriteria): boolean {
  if (!c.from || !c.to) return true;
  return c.from <= c.to;
}

function matchesText(row: AudioServiceRow, text: string): boolean {
  const needle = normalizeText(text);
  if (!needle) return true;
  return (
    normalizeText(row.title).includes(needle) || normalizeText(row.speaker).includes(needle)
  );
}

/** Intersection de tous les critères actifs. Plage incohérente → `[]`. */
export function filterQueue(rows: AudioServiceRow[], c: QueueCriteria): AudioServiceRow[] {
  if (!isRangeValid(c)) return [];
  return rows.filter((row) => {
    if (c.status && row.status !== c.status) return false;
    if (c.type && row.type !== c.type) return false;

    const day = row.serviceDate.slice(0, 10); // AAAA-MM-JJ
    if (c.year && day.slice(0, 4) !== c.year) return false;
    if (c.from && day < c.from) return false;
    if (c.to && day > c.to) return false;

    if (c.speaker === NO_SPEAKER) {
      if (row.speaker && row.speaker.trim()) return false;
    } else if (c.speaker && row.speaker !== c.speaker) {
      return false;
    }

    if (c.series === NO_SERIES) {
      if (row.series && row.series.trim()) return false;
    } else if (c.series && row.series !== c.series) {
      return false;
    }

    if (!matchesText(row, c.text)) return false;
    return true;
  });
}

function sortValue(row: AudioServiceRow, key: SortKey): number | string {
  switch (key) {
    case "date":
      return row.serviceDate;
    case "status":
      return STATUS_SORT_ORDER[row.status] ?? 99;
    case "segments":
      return row.segmentCount;
    case "opens":
      return row.openCount;
  }
}

/**
 * Copie triée. Départage systématique par date de service décroissante à valeur
 * égale (ordre stable et prévisible, cf. spec).
 */
export function sortQueue(
  rows: AudioServiceRow[],
  key: SortKey,
  dir: SortDir
): AudioServiceRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va < vb) return -1 * factor;
    if (va > vb) return 1 * factor;
    // tie-break : date de service décroissante
    if (a.serviceDate < b.serviceDate) return 1;
    if (a.serviceDate > b.serviceDate) return -1;
    return 0;
  });
}

// ─── Persistance intra-session ──────────────────────────────────────────────
// Variable de portée module : survit à une navigation SPA (ouvrir un
// enregistrement puis revenir, création depuis la modale), perdue au
// rechargement complet de l'onglet. Pas de sessionStorage, pas d'URL.

export interface QueueViewState {
  criteria: QueueCriteria;
  sort: SortState;
}

let lastState: QueueViewState | null = null;

export function loadState(): QueueViewState | null {
  return lastState;
}

export function saveState(state: QueueViewState): void {
  lastState = { criteria: { ...state.criteria }, sort: { ...state.sort } };
}

/** Réservé aux tests — remet la persistance à zéro. */
export function __resetState(): void {
  lastState = null;
}
