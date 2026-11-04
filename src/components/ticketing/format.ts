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
