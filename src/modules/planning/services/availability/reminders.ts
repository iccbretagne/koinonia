import type { DbClient } from "./db";

/** Minuit UTC du jour de `date`. */
export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Inscrit les relances du jour et ne renvoie que les couples (STAR, événement) nouveaux : un STAR
 * ne reçoit jamais deux relances pour le même événement le même jour (spec 058).
 */
export async function recordReminders(
  db: DbClient,
  pairs: { memberId: string; eventId: string }[],
  now: Date
): Promise<{ memberId: string; eventId: string }[]> {
  if (pairs.length === 0) return [];
  const sentOn = startOfDay(now);
  const already = await db.availabilityReminderLog.findMany({
    where: { sentOn, OR: pairs.map((p) => ({ memberId: p.memberId, eventId: p.eventId })) },
    select: { memberId: true, eventId: true },
  });
  const seen = new Set(already.map((a) => `${a.memberId}:${a.eventId}`));
  const fresh = pairs.filter((p) => !seen.has(`${p.memberId}:${p.eventId}`));
  if (fresh.length > 0) {
    await db.availabilityReminderLog.createMany({ data: fresh.map((p) => ({ ...p, sentOn })), skipDuplicates: true });
  }
  return fresh;
}
