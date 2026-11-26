import type { StatusTone } from "@/components/ui/StatusChip";
import type { AssignmentStatus, CampaignStatus } from "@/modules/campaigns/schemas";

/** Affichage commun des écrans de pilotage des collectes (spec 090). Pur, importable des deux côtés. */

/** Type d'une donnée serveur après passage au client (dates en chaînes ISO). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, StatusTone> = {
  DRAFT: "neutral",
  OPEN: "success",
  CLOSED: "info",
};

export const ASSIGNMENT_STATUS_TONES: Record<AssignmentStatus, StatusTone> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  SUBMITTED: "brand",
  CHANGES_REQUESTED: "warning",
  VALIDATED: "success",
};

const PARIS = "Europe/Paris";

/** « 4 déc. 2026 » (heure de Paris), « — » sans date. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: PARIS });
}

/** « 4 déc. à 14h05 » (heure de Paris). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: PARIS });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS }).replace(":", "h");
  return `${day} à ${time}`;
}

/** Jour calendaire « AAAA-MM-JJ » d'un instant, à Paris (champ `type="date"`). */
export function parisDayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-CA", { timeZone: PARIS });
}

/** Jour calendaire d'une colonne `@db.Date` (stockée à minuit UTC). */
export function utcDayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export const percent = (rate: number) => `${Math.round(rate * 100)} %`;
