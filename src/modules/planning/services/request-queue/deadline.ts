import { dayKey } from "@/lib/request-queue";

/**
 * Échéance d'une demande dans la file de traitement (spec 063) : la date à laquelle elle doit
 * être traitée, selon son type. Fonction pure — les données (annonce, événement référencé) sont
 * fournies par l'appelant.
 */

export type DeadlineKind = "culte" | "event" | "planning" | "brief" | "none";

export interface DeadlineAnnouncement {
  readonly eventDate: Date | string | null;
  readonly targetEvents: readonly { readonly date: Date | string }[];
}

export interface DeadlineEvent {
  readonly date: Date | string;
  readonly planningDeadline: Date | string | null;
}

export interface DeadlineInput {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly announcement: DeadlineAnnouncement | null;
  /** Événement visé par `payload.eventId` (modification, annulation, planning). */
  readonly event: DeadlineEvent | null;
}

export interface Deadline {
  readonly date: string | null;
  readonly kind: DeadlineKind;
}

const NONE: Deadline = { date: null, kind: "none" };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Premier culte ciblé encore à venir (aujourd'hui compris), sinon la date d'événement. */
function announcementDeadline(announcement: DeadlineAnnouncement | null, now: Date): Deadline {
  if (!announcement) return NONE;
  const today = dayKey(now)!;
  const upcoming = announcement.targetEvents
    .map((e) => iso(e.date))
    .filter((d) => (dayKey(d) ?? "") >= today)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  if (upcoming.length > 0) return { date: upcoming[0], kind: "culte" };
  if (announcement.eventDate) return { date: iso(announcement.eventDate), kind: "event" };
  return NONE;
}

export function requestDeadline(input: DeadlineInput, now: Date): Deadline {
  switch (input.type) {
    case "DIFFUSION_INTERNE":
    case "RESEAUX_SOCIAUX":
      return announcementDeadline(input.announcement, now);
    case "VISUEL": {
      const brief = nonEmptyString(input.payload.deadline);
      return brief ? { date: brief, kind: "brief" } : announcementDeadline(input.announcement, now);
    }
    case "AJOUT_EVENEMENT": {
      const date = nonEmptyString(input.payload.eventDate);
      return date ? { date, kind: "event" } : NONE;
    }
    case "MODIFICATION_EVENEMENT":
    case "ANNULATION_EVENEMENT":
      return input.event ? { date: iso(input.event.date), kind: "event" } : NONE;
    case "MODIFICATION_PLANNING":
      if (!input.event) return NONE;
      return input.event.planningDeadline
        ? { date: iso(input.event.planningDeadline), kind: "planning" }
        : { date: iso(input.event.date), kind: "event" };
    default:
      return NONE;
  }
}
