import type { Session } from "next-auth";
import { z } from "zod";
import type { AssistantDataParams, AssistantDataQuestion, AssistantViewer, DataRefusal } from "@/core/assistant";
import { dayKey } from "@/lib/paris-days";

/**
 * Outils partagés des questions de données (spec 075). Chaque fournisseur revérifie le droit de
 * son écran (défense en profondeur : le moteur a déjà filtré la fiche par audience) et réutilise
 * le chargeur ou la règle de périmètre de cet écran.
 */

export type DataQuestion = AssistantDataQuestion<AssistantDataParams, Session>;

export const paramsSchema: z.ZodType<AssistantDataParams> = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const REFUSED: DataRefusal = { refused: true };

export const can = (viewer: AssistantViewer, permission: string) => viewer.permissions.includes(permission);
export const hasPredicate = (viewer: AssistantViewer, predicate: string) => viewer.predicates.includes(predicate);

const TIME_ZONE = "Europe/Paris";
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });
const euroFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** « dim. 8 nov. » */
export const formatDay = (date: Date) => dayFmt.format(date);
/** « 10:00 » */
export const formatTime = (date: Date) => timeFmt.format(date);
/** « novembre 2026 » pour AAAA-MM */
export const formatMonth = (month: string) => monthFmt.format(new Date(`${month}-01T00:00:00Z`));
export const formatEuros = (amount: number) => euroFmt.format(amount);

/** Aujourd'hui à Paris, AAAA-MM-JJ. */
export const today = (now = new Date()) => dayKey(now)!;

/** Début du jour courant (UTC) : un événement d'aujourd'hui compte comme « à venir ». */
export function startOfToday(now = new Date()): Date {
  return new Date(`${today(now)}T00:00:00Z`);
}

/** Bornes d'un mois AAAA-MM. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/**
 * Fenêtre large autour d'un jour de Paris (la date d'un événement est un instant UTC) ; filtrer
 * ensuite avec `isOnDay`.
 */
export function dayWindow(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, d - 1)), to: new Date(Date.UTC(y, m - 1, d + 2)) };
}
export const isOnDay = (date: Date, day: string) => dayKey(date) === day;

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export const SERVICE_STATUS_LABEL: Record<string, string> = {
  EN_SERVICE: "En service",
  EN_SERVICE_DEBRIEF: "En service + debrief",
  INDISPONIBLE: "Indisponible",
  REMPLACANT: "Remplaçant",
};
