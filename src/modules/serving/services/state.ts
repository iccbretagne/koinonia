import type { ServingApplicationStatus, ServingAssignmentStatus } from "@/generated/prisma/client";

/**
 * Règles pures du cycle de vie d'une candidature (spec 073) : transitions d'une affectation,
 * candidatures à traiter par le PVS, fin d'observation et échéance de conservation.
 */

export type AssignmentAction = "accept" | "confirm" | "send-back";

const TRANSITIONS: Record<AssignmentAction, readonly ServingAssignmentStatus[]> = {
  // Le département accueille une affectation en attente
  accept: ["PENDING"],
  // Confirmation pendant (ou après échéance de) l'observation
  confirm: ["OBSERVATION"],
  // Refus avant accueil, ou renvoi pendant l'observation
  "send-back": ["PENDING", "OBSERVATION"],
};

export function canTransition(from: ServingAssignmentStatus, action: AssignmentAction): boolean {
  return TRANSITIONS[action].includes(from);
}

/** Affectation qui donne accès à la fiche à son département. */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly ServingAssignmentStatus[] = ["PENDING", "OBSERVATION", "CONFIRMED"];
/** Affectation qui fait du candidat un STAR accueilli (vue du STAR, D8). */
export const WELCOMED_ASSIGNMENT_STATUSES: readonly ServingAssignmentStatus[] = ["OBSERVATION", "CONFIRMED"];

type AssignmentLike = {
  status: ServingAssignmentStatus;
  resolvedAt: Date | null;
  decidedAt: Date | null;
};

type ApplicationLike = {
  status: ServingApplicationStatus;
  createdAt: Date;
  decidedAt: Date | null;
  assignments: readonly AssignmentLike[];
};

/** Renvoi d'un département pas encore traité par le PVS. */
export function hasPendingSendBack(app: Pick<ApplicationLike, "assignments">): boolean {
  return app.assignments.some((a) => a.status === "SENT_BACK" && a.resolvedAt === null);
}

/** À traiter par le PVS : reçue, ou validée avec un renvoi en attente. */
export function needsPvsAction(app: ApplicationLike): boolean {
  if (app.status === "RECEIVED") return true;
  return app.status === "VALIDATED" && hasPendingSendBack(app);
}

/** Au moins une affectation active (en attente, en observation ou confirmée). */
export function hasActiveAssignment(app: Pick<ApplicationLike, "assignments">): boolean {
  return app.assignments.some((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status));
}

/**
 * Ajoute des mois calendaires en restant sur le dernier jour du mois si besoin
 * (31 janvier + 1 mois = 28 ou 29 février).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function observationEndsAt(acceptedAt: Date, months: number): Date {
  return addMonths(acceptedAt, months);
}

/** Délai avant la fin d'observation à partir duquel le rappel part. */
export const ENDING_SOON_DAYS = 14;
/** Espacement des relances d'une observation échue. */
export const OVERDUE_RELANCE_DAYS = 7;
/** Avertissement du PVS avant l'effacement d'une candidature jamais traitée. */
export const PURGE_WARNING_MONTHS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ObservationPhase = "running" | "ending-soon" | "overdue";

export function observationPhase(endsAt: Date, now: Date): ObservationPhase {
  if (now.getTime() >= endsAt.getTime()) return "overdue";
  if (endsAt.getTime() - now.getTime() <= ENDING_SOON_DAYS * DAY_MS) return "ending-soon";
  return "running";
}

/**
 * Échéance d'effacement d'une candidature, ou `null` si elle ne doit pas être effacée (une
 * affectation est active : la fiche suit alors celle du STAR).
 *
 * - Non retenue : à partir de la décision.
 * - Jamais traitée (reçue) : à partir de la réception (D5).
 * - Validée mais renvoyée par tous ses départements : à partir du dernier renvoi.
 */
export function retentionDeadline(app: ApplicationLike, retentionMonths: number): Date | null {
  if (app.status === "REJECTED") return addMonths(app.decidedAt ?? app.createdAt, retentionMonths);
  if (hasActiveAssignment(app)) return null;
  if (app.status === "RECEIVED") return addMonths(app.createdAt, retentionMonths);
  const lastSendBack = app.assignments
    .map((a) => a.decidedAt?.getTime() ?? 0)
    .reduce((max, t) => Math.max(max, t), app.decidedAt?.getTime() ?? app.createdAt.getTime());
  return addMonths(new Date(lastSendBack), retentionMonths);
}

/** Nombre de jours entiers écoulés entre deux dates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
