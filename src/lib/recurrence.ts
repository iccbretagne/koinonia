/**
 * Génération de dates récurrentes, partagée entre les événements d'église (création directe
 * et demandes approuvées), les événements d'équipe (spec 044) et les réservations de salle.
 */

export const MAX_RECURRENCE_OCCURRENCES = 104; // ~2 ans hebdomadaires

export function generateRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): { dates: Date[]; truncated: boolean } {
  if (Number.isNaN(endDate.getTime())) return { dates: [], truncated: false };
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (dates.length < MAX_RECURRENCE_OCCURRENCES) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;
    if (current > endDate) break;
    dates.push(new Date(current));
  }
  const truncated = dates.length === MAX_RECURRENCE_OCCURRENCES && current <= endDate;
  return { dates, truncated };
}
