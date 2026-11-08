import type { FinancialJustificationStatus, FinancialRequestType } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

/**
 * Règles pures des justificatifs après la remise des fonds (spec 078) : éligibilité, transitions,
 * reliquat et complément, échéances. Sans base de données, testées directement.
 */

export const DEFAULT_FIRST_REMINDER_DAYS = 7;
export const DEFAULT_REMINDER_INTERVAL_DAYS = 7;
/** À partir de cette relance, le responsable du département et le Ministre sont prévenus. */
export const ESCALATION_FROM_REMINDER = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);
export const cents = (n: number) => Math.round(n * 100) / 100;
/** Mois « AAAA-MM » d'une date (heure de Paris non nécessaire : granularité du mois). */
export const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export interface EligibilityInput {
  type: FinancialRequestType;
  hasAttachment: boolean;
  departmentFunction: string | null;
  fromShuttle: boolean;
  isOverage: boolean;
}

/**
 * Une demande entièrement versée attend des justificatifs : avance de budget, ou note de frais
 * payée sans pièce. Jamais la navette (registre déjà justifié), ni une note issue de la navette,
 * ni une note de frais liée à un dépassement (justifiée par l'avance).
 */
export function needsJustification(r: EligibilityInput): boolean {
  if (r.departmentFunction === "NAVETTE" || r.fromShuttle || r.isOverage) return false;
  if (r.type === "BUDGET_ADVANCE") return true;
  return !r.hasAttachment;
}

/**
 * Arriéré : demande éligible, entièrement versée, sans justification — versée avant la mise en
 * service du suivi. La compta peut alors en réclamer les justificatifs.
 */
export function isJustificationClaimable(
  r: EligibilityInput & { justificationId: string | null; status: string; payments: { releasedAt: Date | string | null }[] }
): boolean {
  if (r.justificationId || r.status !== "APPROVED" || r.payments.length === 0) return false;
  if (r.payments.some((p) => p.releasedAt === null)) return false;
  return needsJustification(r);
}

export type JustificationAction = "submit" | "accept" | "reject" | "waive" | "return";

/** Reliquat à rendre : versé − dépensé, jamais négatif. */
export const remainderOf = (released: number, spent: number) => cents(Math.max(0, released - spent));
/** Complément à demander : dépensé − versé, jamais négatif. */
export const overageOf = (released: number, spent: number) => cents(Math.max(0, spent - released));

/** État après une action, ou une erreur 400 si l'action n'a pas de sens dans cet état. */
export function nextStatus(
  current: FinancialJustificationStatus,
  action: JustificationAction,
  amounts: { released: number; spent: number | null }
): FinancialJustificationStatus {
  const afterDecision = (): FinancialJustificationStatus =>
    amounts.spent !== null && remainderOf(amounts.released, amounts.spent) > 0 ? "RETURN_DUE" : "SETTLED";
  switch (action) {
    case "submit":
      if (current === "AWAITING" || current === "SUBMITTED") return "SUBMITTED";
      break;
    case "accept":
      if (current === "SUBMITTED") return afterDecision();
      break;
    case "reject":
      if (current === "SUBMITTED") return "AWAITING";
      break;
    case "waive":
      if (current === "AWAITING" || current === "SUBMITTED") return afterDecision();
      break;
    case "return":
      if (current === "RETURN_DUE") return "SETTLED";
      break;
  }
  throw new ApiError(400, "Action impossible dans l'état actuel des justificatifs");
}

/** Relances actives : justificatifs attendus, ou reliquat pas encore rendu. */
export const isReminded = (status: FinancialJustificationStatus) => status === "AWAITING" || status === "RETURN_DUE";

export interface DelaySettings {
  firstReminderDays: number;
  reminderIntervalDays: number;
}
