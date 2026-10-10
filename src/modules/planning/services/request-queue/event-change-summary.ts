/**
 * Résumé d'une demande de modification d'événement (spec 063) : pour chaque champ que la demande
 * change, la valeur actuelle de l'événement et la valeur demandée. Mêmes champs que ceux appliqués
 * par l'exécuteur (`executeModificationEvenement`).
 */

export interface EventChangeLine {
  readonly field: "title" | "type" | "date" | "planningDeadline";
  readonly label: string;
  /** Valeur actuelle ; date en ISO pour `date`/`planningDeadline`. */
  readonly before: string | null;
  readonly after: string | null;
}

export interface SummaryEvent {
  readonly title: string;
  readonly type: string;
  readonly date: Date | string;
  readonly planningDeadline: Date | string | null;
}

const FIELDS: { field: EventChangeLine["field"]; label: string }[] = [
  { field: "title", label: "Titre" },
  { field: "type", label: "Type" },
  { field: "date", label: "Date" },
  { field: "planningDeadline", label: "Date limite de planification" },
];

function asString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value !== "" ? value : null;
}

export function eventChangeSummary(changes: unknown, event: SummaryEvent | null): EventChangeLine[] {
  if (!changes || typeof changes !== "object") return [];
  const requested = changes as Record<string, unknown>;
  const lines: EventChangeLine[] = [];
  for (const { field, label } of FIELDS) {
    if (!(field in requested)) continue;
    const after = asString(requested[field]);
    // Titre, type, date vides ne sont pas appliqués par l'exécuteur ; seule la date limite peut être retirée.
    if (after === null && field !== "planningDeadline") continue;
    lines.push({ field, label, before: event ? asString(event[field]) : null, after });
  }
  return lines;
}
