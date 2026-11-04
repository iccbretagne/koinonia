import type { TicketingAgeGroup, TicketingDirection, TicketingPassageSubject } from "@/generated/prisma/client";

/**
 * Présences (spec 074, lot 2) : calculées à partir des passages, jamais stockées. Les passages
 * sont triés par heure de scan (horloge de l'appareil corrigée), puis par réception : des
 * passages reçus en retard ou dans le désordre donnent quand même un compteur exact. Le dernier
 * sens de chaque personne compte ; les comptages manuels (+1 / −1) s'ajoutent.
 */

export interface PassageLite {
  id: string;
  subject: TicketingPassageSubject;
  participantId: string | null;
  assignmentId: string | null;
  direction: TicketingDirection;
  delta: number;
  scannedAt: Date;
  receivedAt?: Date;
  anomaly?: boolean;
}

export interface PresenceCounts {
  participants: number;
  minors: number;
  staff: number;
  manual: number;
  total: number;
}

export const subjectKey = (p: Pick<PassageLite, "subject" | "participantId" | "assignmentId">) =>
  p.subject === "PARTICIPANT" ? `p:${p.participantId}` : `s:${p.assignmentId}`;

export function sortPassages<T extends PassageLite>(passages: T[]): T[] {
  return [...passages].sort(
    (a, b) => a.scannedAt.getTime() - b.scannedAt.getTime() || (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0) || a.id.localeCompare(b.id)
  );
}

/** Personnes à l'intérieur (clé de sujet → vrai) et comptage manuel, à la fin de la liste. */
export function insideState(passages: PassageLite[]): { inside: Set<string>; manual: number } {
  const last = new Map<string, TicketingDirection>();
  let manual = 0;
  for (const p of sortPassages(passages)) {
    if (p.subject === "MANUAL") {
      manual += p.direction === "IN" ? p.delta : -p.delta;
      continue;
    }
    last.set(subjectKey(p), p.direction);
  }
  return { inside: new Set([...last].filter(([, d]) => d === "IN").map(([k]) => k)), manual };
}

export function computePresence(passages: PassageLite[], ageOf: Map<string, TicketingAgeGroup>): PresenceCounts {
  const { inside, manual } = insideState(passages);
  let participants = 0;
  let minors = 0;
  let staff = 0;
  for (const key of inside) {
    if (key.startsWith("s:")) staff++;
    else {
      participants++;
      const age = ageOf.get(key.slice(2));
      if (age && age !== "ADULT") minors++;
    }
  }
  return { participants, minors, staff, manual, total: Math.max(0, participants + staff + manual) };
}

/** Seuil de jauge atteint : 0, 90 ou 100 (%). */
export function capacityLevel(total: number, capacity: number): 0 | 90 | 100 {
  if (capacity <= 0) return 0;
  if (total >= capacity) return 100;
  if (total >= capacity * 0.9) return 90;
  return 0;
}

/**
 * Un passage est une anomalie s'il répète le sens connu de la personne à cet instant (entrée
 * d'une personne déjà à l'intérieur, sortie d'une personne absente). Il est gardé et signalé.
 */
export function isAnomalous(history: PassageLite[], candidate: PassageLite): boolean {
  if (candidate.subject === "MANUAL") return false;
  const key = subjectKey(candidate);
  const before = sortPassages(history.filter((p) => p.subject !== "MANUAL" && subjectKey(p) === key && p.scannedAt <= candidate.scannedAt));
  const lastDirection = before.at(-1)?.direction ?? "OUT";
  return lastDirection === candidate.direction;
}

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

/** Présences de l'événement : compteur, catégories, mineurs seuls présents, anomalies, courbe. */
export async function getPresence(eventId: string) {
  const prisma = await db();
  const [event, passages, participants] = await Promise.all([
    prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true, startsAt: true } }),
    prisma.ticketingPassage.findMany({ where: { eventId }, orderBy: { scannedAt: "asc" } }),
    prisma.ticketingParticipant.findMany({
      where: { eventId },
      select: { id: true, firstName: true, lastName: true, ageGroup: true, booking: { select: { guardianName: true, guardianPhone: true } } },
    }),
  ]);
  const ageOf = new Map(participants.map((p) => [p.id, p.ageGroup]));
  const counts = computePresence(passages, ageOf);
  const { inside } = insideState(passages);
  const unaccompanied = participants
    .filter((p) => p.booking.guardianName && inside.has(`p:${p.id}`))
    .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, guardian: p.booking.guardianName, phone: p.booking.guardianPhone }));

  // Courbe : présents à la fin de chaque quart d'heure où il y a eu des passages.
  const curve: { at: string; total: number }[] = [];
  const sorted = sortPassages(passages);
  for (let i = 0; i < sorted.length; i++) {
    const bucket = Math.floor(sorted[i].scannedAt.getTime() / 900_000);
    const next = sorted[i + 1];
    if (!next || Math.floor(next.scannedAt.getTime() / 900_000) !== bucket) {
      curve.push({ at: new Date((bucket + 1) * 900_000).toISOString(), total: computePresence(sorted.slice(0, i + 1), ageOf).total });
    }
  }
  return {
    capacity: event.capacity,
    counts,
    level: capacityLevel(counts.total, event.capacity),
    unaccompanied,
    anomalies: passages.filter((p) => p.anomaly).length,
    curve,
    serverTime: new Date().toISOString(),
  };
}
export type PresenceView = Awaited<ReturnType<typeof getPresence>>;

/** Notifie l'organisation au premier franchissement de 90 % puis de 100 % de la jauge. */
export async function notifyCapacity(eventId: string, total: number) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUnique({ where: { id: eventId }, select: { capacity: true, capacityAlertLevel: true, title: true } });
  if (!event) return;
  const level = capacityLevel(total, event.capacity);
  if (level === 0 || level <= event.capacityAlertLevel) return;
  const claimed = await prisma.ticketingEvent.updateMany({ where: { id: eventId, capacityAlertLevel: { lt: level } }, data: { capacityAlertLevel: level } });
  if (claimed.count === 0) return;
  const { notifyEventTeam } = await import("./team-notify");
  await notifyEventTeam(eventId, ["ORGANIZER", "RECEPTION"], {
    type: "TICKETING_CAPACITY",
    title: `${event.title} : jauge ${level === 100 ? "atteinte" : "à 90 %"}`,
    message: `${total} personnes présentes pour une jauge de ${event.capacity}.`,
    link: `/billetterie/${eventId}/controle`,
  });
}
