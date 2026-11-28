import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { EVENT_ACTIONS, isTicketingManager } from "../auth";

/**
 * Règlements de billetterie à confirmer (spec 092) : déclarations « J'ai payé » en attente sur les
 * événements non clôturés de l'église où l'appelant a le geste `payments` — organisateur implicite
 * (`ticketing:manage`), Organisateur ou Trésorier attribué (matrice `EVENT_ACTIONS`, comme
 * `getEventAccess`). L'église qui fait foi est celle de l'événement.
 */
export async function paymentsEventsWhere(session: Session, churchId: string): Promise<Prisma.TicketingEventWhereInput> {
  const manager = await isTicketingManager(session, churchId);
  return {
    churchId,
    status: { not: "ARCHIVED" },
    ...(manager ? {} : { roles: { some: { userId: session.user.id, role: { in: [...EVENT_ACTIONS.payments] } } } }),
  };
}

/**
 * Nombre de déclarations en attente et événements concernés (une requête groupée), ou `null` si
 * l'appelant n'a le geste `payments` sur aucun événement non clôturé (aucune file, pas même vide).
 */
export async function countPendingDeclarations(
  session: Session,
  churchId: string
): Promise<{ count: number; perEvent: { eventId: string; count: number }[] } | null> {
  if (!session.user.isSuperAdmin && !session.user.churchRoles.some((r) => r.churchId === churchId)) return null;
  const { prisma } = await import("@/lib/prisma");
  const eventWhere = await paymentsEventsWhere(session, churchId);
  const [events, grouped] = await Promise.all([
    prisma.ticketingEvent.count({ where: eventWhere }),
    prisma.ticketingPayment.groupBy({
      by: ["eventId"],
      where: { kind: "DECLARATION", status: "PENDING", event: eventWhere },
      _count: { _all: true },
    }),
  ]);
  if (events === 0) return null;
  return {
    count: grouped.reduce((sum, g) => sum + g._count._all, 0),
    perEvent: grouped.map((g) => ({ eventId: g.eventId, count: g._count._all })),
  };
}
