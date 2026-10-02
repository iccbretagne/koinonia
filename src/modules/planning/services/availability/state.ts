import type { AvailabilityAnswer } from "@/generated/prisma/client";

/**
 * Calcul pur de la disponibilité d'un STAR (spec 058, ADR-0020) — aucune dépendance BDD.
 * La disponibilité est dérivée, jamais saisie comme statut de planning.
 */

export type AvailabilityState = AvailabilityAnswer | "NO_RESPONSE" | "NOT_ASKED";

export interface ResolvedAvailability {
  state: AvailabilityState;
  /** « Sans réponse » alors que l'échéance est passée : compte comme indisponible. */
  overdue: boolean;
  source: "response" | "period" | "asked" | "none";
}

export interface ResolveInput {
  /** Réponse explicite à l'événement pour ce département, s'il y en a une. */
  answer?: AvailabilityAnswer | null;
  /** Une période d'indisponibilité active couvre l'événement pour ce département. */
  coveredByPeriod: boolean;
  /** La disponibilité a été demandée (collecte ouverte ou demande ciblée). */
  asked: boolean;
  /** Échéance de la demande, si elle existe. */
  dueAt?: Date | null;
  now: Date;
}

/** Précédence : réponse > période > demandé (« Sans réponse ») > non demandé. */
export function resolveAvailability({ answer, coveredByPeriod, asked, dueAt, now }: ResolveInput): ResolvedAvailability {
  if (answer) return { state: answer, overdue: false, source: "response" };
  if (coveredByPeriod) return { state: "UNAVAILABLE", overdue: false, source: "period" };
  if (asked) return { state: "NO_RESPONSE", overdue: !!dueAt && now.getTime() > dueAt.getTime(), source: "asked" };
  return { state: "NOT_ASKED", overdue: false, source: "none" };
}

/** Vrai si le STAR ne doit pas être compté disponible : indisponible déclaré ou sans réponse en retard. */
export function countsAsUnavailable(r: ResolvedAvailability): boolean {
  return r.state === "UNAVAILABLE" || (r.state === "NO_RESPONSE" && r.overdue);
}

/** Raison affichée dans l'avertissement quand on place un STAR indisponible, ou `null`. */
export function unavailabilityReason(r: ResolvedAvailability): string | null {
  if (r.state === "UNAVAILABLE") return r.source === "period" ? "est indisponible sur cette période" : "a répondu « Pas disponible »";
  if (r.state === "NO_RESPONSE" && r.overdue) return "n'a pas répondu";
  return null;
}

export interface CollectionSettings {
  openMonthsBefore: number;
  closeDaysBefore: number;
  relanceDaysBefore: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Premier jour (UTC) du mois de `date`. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Premier jour du mois suivant. */
export function nextMonthStart(month: Date): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
}

/** Ouverture, clôture et relance de la collecte d'un mois cible. */
export function collectionWindow(settings: CollectionSettings, month: Date, firstEventDate: Date) {
  const opensAt = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - settings.openMonthsBefore, 1));
  const closesAt = new Date(firstEventDate.getTime() - settings.closeDaysBefore * DAY_MS);
  const relanceAt = new Date(closesAt.getTime() - settings.relanceDaysBefore * DAY_MS);
  return { opensAt, closesAt, relanceAt };
}

/**
 * Échéance d'une demande ciblée : la clôture de la collecte si l'événement en fait partie et
 * qu'elle n'est pas passée ; sinon `daysBefore` jours avant l'événement, jamais avant `now`.
 */
export function askDueAt({
  eventDate,
  collectionClosesAt,
  now,
  daysBefore = 7,
}: {
  eventDate: Date;
  collectionClosesAt?: Date | null;
  now: Date;
  daysBefore?: number;
}): Date {
  if (collectionClosesAt && collectionClosesAt.getTime() > now.getTime()) return collectionClosesAt;
  const due = new Date(eventDate.getTime() - daysBefore * DAY_MS);
  return due.getTime() > now.getTime() ? due : now;
}

/**
 * Une relance part quand sa date est atteinte et que l'échéance n'est pas passée — sauf si la
 * demande a été ouverte après cette date (échéance trop proche : la notification d'ouverture
 * tient lieu de relance).
 */
export function shouldRelance({
  dueAt,
  relanceDaysBefore,
  openedAt,
  now,
}: {
  dueAt: Date;
  relanceDaysBefore: number;
  openedAt: Date;
  now: Date;
}): boolean {
  const relanceAt = new Date(dueAt.getTime() - relanceDaysBefore * DAY_MS);
  return now.getTime() >= relanceAt.getTime() && now.getTime() < dueAt.getTime() && openedAt.getTime() < relanceAt.getTime();
}
