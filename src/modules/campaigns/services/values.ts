import { createHash } from "node:crypto";
import { parisDateTime } from "@/lib/paris-time";

/**
 * Petits outils partagés du niveau campagne (spec 090) : JSON canonique et empreinte, dates de
 * la définition. Purs.
 */

/** JSON à clés triées, sans `undefined` : deux définitions équivalentes ont le même texte. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const hashJson = (value: unknown) => sha256(canonicalJson(value));

/** Jour calendaire « AAAA-MM-JJ » → date (colonne `@db.Date`). */
export const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Échéance : un jour seul vaut la fin de cette journée à Paris ; un instant ISO est repris tel quel. */
export function dueAtToDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parisDateTime(value, "23:59") : new Date(value);
}

export const sameInstant = (a: Date | null | undefined, b: Date | null | undefined) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);
