/**
 * Utilitaires de la file de traitement des demandes (spec 063), sans dépendance serveur :
 * importables par les composants client comme par le service qui calcule les échéances.
 * Les comparaisons se font au jour près, dans le fuseau de l'église (Europe/Paris).
 */

import { dayKey, daysUntil, keyToUtc, normalizeText } from "./paris-days";

export { dayKey, daysUntil };

export type DeadlineGroupKey = "overdue" | "week" | "later" | "none";

export const DEADLINE_GROUP_LABEL: Record<DeadlineGroupKey, string> = {
  overdue: "En retard",
  week: "Cette semaine",
  later: "Plus tard",
  none: "Sans échéance",
};

const GROUP_ORDER: DeadlineGroupKey[] = ["overdue", "week", "later", "none"];

export interface DeadlineSortable {
  readonly deadline: string | null;
  readonly submittedAt: string;
}

function groupOf(item: DeadlineSortable, now: Date): DeadlineGroupKey {
  const days = item.deadline ? daysUntil(item.deadline, now) : null;
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days < 7) return "week";
  return "later";
}

function compareByDeadline(a: DeadlineSortable, b: DeadlineSortable): number {
  const da = dayKey(a.deadline);
  const db = dayKey(b.deadline);
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
}

/**
 * File « À traiter » : échéance la plus proche d'abord, puis la plus ancienne demande ; groupes
 * En retard / Cette semaine (7 jours) / Plus tard / Sans échéance, sans groupe vide.
 */
export function groupByDeadline<T extends DeadlineSortable>(
  items: readonly T[],
  now: Date
): { key: DeadlineGroupKey; label: string; items: T[] }[] {
  const sorted = [...items].sort(compareByDeadline);
  return GROUP_ORDER.map((key) => ({
    key,
    label: DEADLINE_GROUP_LABEL[key],
    items: sorted.filter((item) => groupOf(item, now) === key),
  })).filter((group) => group.items.length > 0);
}

/** « aujourd'hui », « demain », « dans 3 j », « hier », « en retard de 2 j ». */
export function relativeDeadline(deadline: string, now: Date): string | null {
  const days = daysUntil(deadline, now);
  if (days === null) return null;
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days > 1) return `dans ${days} j`;
  if (days === -1) return "hier";
  return `en retard de ${-days} j`;
}

const shortDayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** « dim. 12 oct. » — formaté depuis le jour calendaire, sans décalage de fuseau. */
export function formatDeadline(deadline: string): string | null {
  const key = dayKey(deadline);
  return key ? shortDayFmt.format(new Date(keyToUtc(key))) : null;
}

export interface Searchable {
  readonly title: string;
  readonly author: string;
  readonly source: string | null;
  readonly announcement?: { readonly title: string } | null;
}

/** Recherche locale : titre (ou titre de l'annonce), demandeur, département ou ministère. */
export function matchesQuery(item: Searchable, query: string): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return [item.title, item.announcement?.title, item.author, item.source]
    .filter((value): value is string => !!value)
    .some((value) => normalizeText(value).includes(q));
}

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  DIFFUSION_INTERNE: "Annonce",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  VISUEL: "Visuel",
  AJOUT_EVENEMENT: "Ajout d'événement",
  MODIFICATION_EVENEMENT: "Modification d'événement",
  ANNULATION_EVENEMENT: "Annulation d'événement",
  MODIFICATION_PLANNING: "Modification de planning",
  DEMANDE_ACCES: "Demande d'accès",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  APPROUVEE: "Approuvée",
  EXECUTEE: "Exécutée",
  LIVRE: "Terminée",
  REFUSEE: "Refusée",
  ANNULE: "Annulée",
  ERREUR: "Erreur",
};

/** Statuts encore ouverts : « À traiter » (en attente) et « En cours ». */
export const OPEN_STATUSES = ["EN_ATTENTE", "EN_COURS"] as const;
