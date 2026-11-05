import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/** Outils partagés des services de la trésorerie (spec 076). */

export interface TreasuryActor {
  id: string;
}

export async function db() {
  return prisma;
}

/** Euros → centimes entiers : tous les calculs de soldes se font en centimes. */
export const cents = (n: number) => Math.round(n * 100);
export const euros = (c: number) => c / 100;

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
export const fromIsoDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « octobre 2026 » pour « 2026-10 ». */
export function monthLabel(month: string): string {
  return `${MONTHS.at(Number(month.slice(5, 7)) - 1) ?? ""} ${month.slice(0, 4)}`;
}

/** « 1er novembre » / « 12 octobre » pour une date AAAA-MM-JJ. */
export function dayLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  return `${day === 1 ? "1er" : day} ${MONTHS.at(Number(isoDate.slice(5, 7)) - 1) ?? ""}`;
}

export async function audit(
  churchId: string,
  actor: TreasuryActor,
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT",
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
) {
  await logAudit({ userId: actor.id, churchId, action, entityType, entityId, details });
}
