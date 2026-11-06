const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** « samedi 31 décembre à 20:00 ». */
export function formatDateTime(iso: string | Date): string {
  return DATE_TIME.format(new Date(iso));
}
export function formatDate(iso: string | Date): string {
  return DATE.format(new Date(iso));
}

/** « samedi 31 décembre à 20:00 · Rennes » (lieu facultatif). */
export function dateAndPlace(iso: string | Date, location: string | null | undefined): string {
  const date = formatDateTime(iso);
  return location ? `${date} · ${location}` : date;
}

/** Fond du compteur de présents selon le seuil de jauge atteint (0, 90 ou 100 %). */
export function capacityTone(level: number): string {
  if (level >= 100) return "bg-danger-soft";
  if (level >= 90) return "bg-warning-soft";
  return "border border-line bg-surface";
}

/** Seuil de jauge : 100 si atteinte, 90 au-delà de 90 %, sinon 0. */
export function capacityLevel(total: number, capacity: number): 0 | 90 | 100 {
  if (capacity <= 0) return 0;
  if (total >= capacity) return 100;
  return total >= capacity * 0.9 ? 90 : 0;
}
