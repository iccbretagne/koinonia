import type { ServiceStatus } from "@/generated/prisma/client";
import { PLANNED_STATUSES } from "../staffing-gaps";

/**
 * Règles pures du désistement d'un service (spec 061).
 */

export function isPlannedStatus(status: ServiceStatus | null | undefined): status is ServiceStatus {
  return !!status && (PLANNED_STATUSES as readonly ServiceStatus[]).includes(status);
}

/**
 * Un STAR peut se désister lui-même jusqu'à la date limite de planification de l'événement, ou
 * jusqu'à son début s'il n'en a pas. Au-delà, il doit contacter son responsable.
 */
export function withdrawable(event: { date: Date; planningDeadline: Date | null }, now: Date = new Date()): boolean {
  const limit = event.planningDeadline ?? event.date;
  return now.getTime() < limit.getTime();
}

/** Le remplacement reste possible après l'échéance, jusqu'au début de l'événement. */
export function replaceable(event: { date: Date }, now: Date = new Date()): boolean {
  return now.getTime() < event.date.getTime();
}

/** « dimanche 12 octobre » — pour les messages de notification (même format que la spec 060). */
export const formatServiceDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
