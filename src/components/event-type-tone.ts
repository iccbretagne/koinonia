import type { StatusTone } from "@/components/ui/StatusChip";

/**
 * Tonalité d'une pastille de type d'événement (`StatusChip`) sur les tokens sémantiques — les
 * classes de `@/lib/event-types` restent sur l'ancienne palette pour les écrans pas encore migrés.
 * Le libellé du type est toujours affiché : la couleur n'est jamais seule porteuse du sens.
 */
const EVENT_TYPE_TONE: Record<string, StatusTone> = {
  CULTE: "brand",
  PRIERE: "warning",
  REUNION: "info",
  FORMATION: "danger",
  AUTRE: "success",
};

export function eventTypeTone(type: string): StatusTone {
  return EVENT_TYPE_TONE[type] ?? "neutral";
}

/** Pastille pleine (point de calendrier, légende) de la même famille que `eventTypeTone`. */
const EVENT_TYPE_DOT: Record<string, string> = {
  CULTE: "bg-brand",
  PRIERE: "bg-warning",
  REUNION: "bg-info",
  FORMATION: "bg-danger",
  AUTRE: "bg-success",
};

export function eventTypeDot(type: string): string {
  return EVENT_TYPE_DOT[type] ?? "bg-control-line";
}
