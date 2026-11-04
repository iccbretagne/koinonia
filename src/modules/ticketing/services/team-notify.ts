import type { TicketingRole } from "@/generated/prisma/client";

/**
 * Notifications de l'équipe d'un événement (spec 074), dans le domaine `ticketing`. Sans titulaire
 * du rôle visé, on se replie sur les organisateurs nommés, puis sur le créateur de l'événement.
 */
export async function notifyEventTeam(
  eventId: string,
  roles: TicketingRole[],
  notification: { type: string; title: string; message: string; link?: string }
): Promise<void> {
  try {
    await send(eventId, roles, notification);
  } catch (error) {
    const { logger } = await import("@/lib/logger");
    logger.error(`Billetterie : notification d'équipe non envoyée (${notification.type}) — ${error instanceof Error ? error.message : "erreur"}`);
  }
}

async function send(eventId: string, roles: TicketingRole[], notification: { type: string; title: string; message: string; link?: string }) {
  const { prisma } = await import("@/lib/prisma");
  const event = await prisma.ticketingEvent.findUnique({ where: { id: eventId }, select: { createdById: true, status: true } });
  if (!event || event.status === "ARCHIVED") return;
  const holders = async (wanted: TicketingRole[]) =>
    (await prisma.ticketingEventRole.findMany({ where: { eventId, role: { in: wanted } }, select: { userId: true } })).map((r) => r.userId);

  let userIds = await holders(roles);
  if (userIds.length === 0 && !roles.includes("ORGANIZER")) userIds = await holders(["ORGANIZER"]);
  if (roles.includes("ORGANIZER") && event.createdById) userIds.push(event.createdById);
  if (userIds.length === 0 && event.createdById) userIds = [event.createdById];
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const { notifyUsers } = await import("@/lib/notifications");
  await notifyUsers(unique, { domain: "ticketing", entityType: "TicketingEvent", entityId: eventId, ...notification });
}
