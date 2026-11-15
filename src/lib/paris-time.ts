/**
 * Heure de Paris, changement d'heure compris : jour et heure saisis à Paris → instant UTC.
 * Partagé par l'assistant IA (création d'événements) et les créneaux d'entretien (spec 082).
 */

/** Décalage de Paris (ms) à un instant donné. */
export function parisOffset(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value])
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
}

/** Jour et heure à Paris (« 2026-12-06 », « 10:00 ») → instant, changement d'heure compris. */
export function parisDateTime(dayKey: string, time: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = Date.UTC(y, m - 1, d, hh, mm);
  const first = local - parisOffset(local);
  return new Date(local - parisOffset(first));
}

/** Jour (AAAA-MM-JJ) et heure (HH:MM) d'un instant, à Paris. */
export function parisParts(at: Date): { day: string; time: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: weekdays[parts.weekday] ?? 0 };
}
