import { DEMANDES } from "./demandes";
import { DONNEES } from "./donnees";
import { ESPACES } from "./espaces";
import { FINANCES } from "./finances";
import { FIXED } from "./fixed";
import { MEMBRES_EVENEMENTS, MON_PLANNING, PLANNING_DEPARTEMENT } from "./planning";
import { PRISE_EN_MAIN } from "./prise-en-main";
import type { KnowledgeEntry } from "./types";

/**
 * Fiches fournies avec Koinonia (spec 075), issues de `specs/075-assistant-embarque/
 * base-connaissances.md`. Versionnées avec l'application ; jamais écrites en base.
 */
export const BUILTIN_ENTRIES: readonly KnowledgeEntry[] = [
  ...PRISE_EN_MAIN,
  ...MON_PLANNING,
  ...PLANNING_DEPARTEMENT,
  ...MEMBRES_EVENEMENTS,
  ...DEMANDES,
  ...FINANCES,
  ...ESPACES,
  ...FIXED,
  ...DONNEES,
];

/** Questions proposées par défaut quand l'écran courant n'en a pas de propres. */
export const DEFAULT_SUGGESTIONS = ["D01", "KB-021", "KB-001", "KB-006"] as const;

export type { Audience, EntryKind, KnowledgeEntry, Predicate } from "./types";
export { PREDICATES } from "./types";
