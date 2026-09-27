export const EVENT_TYPES = ["CULTE", "PRIERE", "REUNION", "FORMATION", "AUTRE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  CULTE:     "Culte",
  PRIERE:    "Prière",
  REUNION:   "Réunion",
  FORMATION: "Formation",
  AUTRE:     "Autre",
};

// La couleur d'un type d'événement (pastille, badge) vit dans @/components/event-type-tone
// (eventTypeTone/eventTypeDot, sur les tokens sémantiques) — pas ici, pour éviter le doublon.

export const EVENT_TYPE_OPTIONS = EVENT_TYPES.map((t) => ({
  value: t,
  label: EVENT_TYPE_LABELS[t],
}));

export function getEventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}
