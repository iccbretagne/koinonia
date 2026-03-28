export const EVENT_TYPES = ["CULTE", "PRIERE", "REUNION", "FORMATION", "AUTRE"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  CULTE:     "Culte",
  PRIERE:    "Prière",
  REUNION:   "Réunion",
  FORMATION: "Formation",
  AUTRE:     "Autre",
};

/** Tailwind classes for badge display (bg + text) */
export const EVENT_TYPE_BADGE: Record<string, string> = {
  CULTE:     "bg-icc-violet/10 text-icc-violet",
  PRIERE:    "bg-orange-100 text-orange-600",
  REUNION:   "bg-icc-bleu/10 text-icc-bleu",
  FORMATION: "bg-icc-rouge/10 text-icc-rouge",
  AUTRE:     "bg-green-100 text-green-700",
};

/** Full color tokens for calendar / dot indicators */
export const EVENT_TYPE_COLORS: Record<string, {
  bg: string; text: string; hover: string; dot: string; label: string;
}> = {
  CULTE:     { bg: "bg-icc-violet/10", text: "text-icc-violet",  hover: "hover:bg-icc-violet",  dot: "bg-icc-violet",  label: "Culte" },
  PRIERE:    { bg: "bg-orange-100",    text: "text-orange-600",  hover: "hover:bg-orange-500",  dot: "bg-orange-500",  label: "Prière" },
  REUNION:   { bg: "bg-icc-bleu/10",  text: "text-icc-bleu",    hover: "hover:bg-icc-bleu",    dot: "bg-icc-bleu",    label: "Réunion" },
  FORMATION: { bg: "bg-icc-rouge/10", text: "text-icc-rouge",   hover: "hover:bg-icc-rouge",   dot: "bg-icc-rouge",   label: "Formation" },
  AUTRE:     { bg: "bg-green-100",    text: "text-green-700",   hover: "hover:bg-green-600",   dot: "bg-green-500",   label: "Autre" },
};

export const EVENT_TYPE_OPTIONS = EVENT_TYPES.map((t) => ({
  value: t,
  label: EVENT_TYPE_LABELS[t],
}));

export function getEventTypeBadge(type: string): string {
  return EVENT_TYPE_BADGE[type] ?? EVENT_TYPE_BADGE.AUTRE;
}

export function getEventTypeColors(type: string) {
  return EVENT_TYPE_COLORS[type] ?? EVENT_TYPE_COLORS.AUTRE;
}

export function getEventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}
