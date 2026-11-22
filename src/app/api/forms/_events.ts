import type { Session } from "next-auth";
import { ApiError } from "@/lib/api-utils";
import { hasChurchPermission } from "@/lib/auth";
import { getFormsCapability } from "@/modules/forms/auth";
import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";

/**
 * Événements que l'appelant peut rattacher (spec 085). `forms:manage` : tous ceux de l'église.
 * Accès délégué : événements d'église seulement avec `events:view`, événements de billetterie
 * seulement avec `ticketing:manage` ou un rôle d'événement sur celui-ci.
 */
async function eventScope(session: Session, churchId: string) {
  if ((await getFormsCapability(session, churchId)) === "all") return { events: true, ticketingAll: true };
  return {
    events: await hasChurchPermission(session, "events:view", churchId),
    ticketingAll: await hasChurchPermission(session, "ticketing:manage", churchId),
  };
}

/**
 * Rattachement d'une participation à un événement (spec 079, lot 3, ADR-0027) : validé ici, couche
 * qui seule lit les événements d'église et de billetterie — `forms` n'importe aucun autre module.
 * L'événement doit appartenir à l'église du formulaire ; un événement d'une autre église répond
 * comme un événement inconnu.
 */
export async function assertLinkableEvents(session: Session, churchId: string, input: { eventId?: string | null; ticketingEventId?: string | null }) {
  const scope = input.eventId || input.ticketingEventId ? await eventScope(session, churchId) : null;
  if (input.eventId) {
    if (!scope?.events) throw new ApiError(400, "Événement introuvable dans l'église");
    const event = await prisma.event.findFirst({ where: { id: input.eventId, churchId }, select: { id: true } });
    if (!event) throw new ApiError(400, "Événement introuvable dans l'église");
  }
  if (input.ticketingEventId) {
    if (!registry.has("ticketing")) throw new ApiError(400, "La billetterie n'est pas activée");
    const event = await prisma.ticketingEvent.findFirst({
      where: { id: input.ticketingEventId, churchId, ...(scope?.ticketingAll ? {} : { roles: { some: { userId: session.user.id } } }) },
      select: { id: true },
    });
    if (!event) throw new ApiError(400, "Événement de billetterie introuvable dans l'église");
  }
}

/** Événements proposés au rattachement : 30 derniers jours et à venir (et l'événement déjà choisi). */
export async function linkableEvents(session: Session, churchId: string, current: { eventId: string | null; ticketingEventId: string | null }, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const scope = await eventScope(session, churchId);
  const mine = scope.ticketingAll ? {} : { roles: { some: { userId: session.user.id } } };
  const [events, ticketing] = await Promise.all([
    !scope.events
      ? Promise.resolve([])
      : prisma.event.findMany({
          where: { churchId, OR: [{ date: { gte: since } }, ...(current.eventId ? [{ id: current.eventId }] : [])] },
          select: { id: true, title: true, date: true },
          orderBy: { date: "asc" },
          take: 150,
        }),
    registry.has("ticketing")
      ? prisma.ticketingEvent.findMany({
          where: { churchId, ...mine, OR: [{ endsAt: { gte: since } }, ...(current.ticketingEventId ? [{ id: current.ticketingEventId }] : [])] },
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
