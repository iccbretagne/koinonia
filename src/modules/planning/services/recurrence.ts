/**
 * Génération de dates récurrentes, partagée entre les événements d'église
 * (`request-executor.ts`) et les événements d'équipe (`team-event.service.ts`, spec 044).
 */

export const MAX_RECURRENCE_OCCURRENCES = 104; // ~2 ans hebdomadaires

export function generateRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): { dates: Date[]; truncated: boolean } {
  if (isNaN(endDate.getTime())) return { dates: [], truncated: false };
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
