import { ApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";

/**
 * Rattachement d'une participation à un événement (spec 079, lot 3, ADR-0027) : validé ici, couche
 * qui seule lit les événements d'église et de billetterie — `forms` n'importe aucun autre module.
 * L'événement doit appartenir à l'église du formulaire ; un événement d'une autre église répond
 * comme un événement inconnu.
 */
export async function assertLinkableEvents(churchId: string, input: { eventId?: string | null; ticketingEventId?: string | null }) {
  if (input.eventId) {
    const event = await prisma.event.findFirst({ where: { id: input.eventId, churchId }, select: { id: true } });
    if (!event) throw new ApiError(400, "Événement introuvable dans l'église");
  }
  if (input.ticketingEventId) {
    if (!registry.has("ticketing")) throw new ApiError(400, "La billetterie n'est pas activée");
    const event = await prisma.ticketingEvent.findFirst({ where: { id: input.ticketingEventId, churchId }, select: { id: true } });
    if (!event) throw new ApiError(400, "Événement de billetterie introuvable dans l'église");
  }
}

/** Événements proposés au rattachement : 30 derniers jours et à venir (et l'événement déjà choisi). */
export async function linkableEvents(churchId: string, current: { eventId: string | null; ticketingEventId: string | null }, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [events, ticketing] = await Promise.all([
    prisma.event.findMany({
      where: { churchId, OR: [{ date: { gte: since } }, ...(current.eventId ? [{ id: current.eventId }] : [])] },
      select: { id: true, title: true, date: true },
      orderBy: { date: "asc" },
      take: 150,
    }),
    registry.has("ticketing")
      ? prisma.ticketingEvent.findMany({
          where: { churchId, OR: [{ endsAt: { gte: since } }, ...(current.ticketingEventId ? [{ id: current.ticketingEventId }] : [])] },
          select: { id: true, title: true, startsAt: true },
          orderBy: { startsAt: "asc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);
  return {
    events: events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString() })),
    ticketing: ticketing.map((e) => ({ id: e.id, title: e.title, date: e.startsAt.toISOString() })),
  };
}
