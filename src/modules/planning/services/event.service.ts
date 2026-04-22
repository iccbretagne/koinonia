import type { Prisma } from "@/generated/prisma/client";
import { planningBus } from "../bus";

type TxClient = Prisma.TransactionClient;

interface DeleteEventsCtx {
  tx: TxClient;
  churchId: string;
  userId?: string;
}

/**
 * Supprime un ou plusieurs événements en cascade.
 *
 * Doit être appelé dans une transaction Prisma existante.
 *
 * Ordre :
 * 1. Émet `planning:event:cancelled` pour chaque eventId (handlers cross-module
 *    nettoient leurs FK dans la même tx avant la suppression)
 * 2. Supprime les données planning-owned : Planning, TaskAssignment,
 *    EventDepartment, EventReport, AnnouncementEvent
 * 3. Supprime les Event
 *
 * Utiliser cette fonction pour toute suppression d'événement — API bulk delete
 * ET executor de demandes — afin de garantir la cohérence et les émissions bus.
 */
export async function deleteEvents(
  ctx: DeleteEventsCtx,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;

  // 1. Émettre avant la suppression pour que les handlers cross-module
  //    (ex. discipleship) nettoient leurs FK dans la même transaction.
  for (const eventId of eventIds) {
    await planningBus.emit(
      "planning:event:cancelled",
      { tx: ctx.tx, churchId: ctx.churchId, userId: ctx.userId },
      { eventId, churchId: ctx.churchId, cancelledById: ctx.userId ?? "system" }
    );
  }

  // 2. Cleanup planning-owned (ordre FK : enfants avant parents)
  const eventDeptIds = (
    await ctx.tx.eventDepartment.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true },
    })
  ).map((ed) => ed.id);

  if (eventDeptIds.length > 0) {
    await ctx.tx.planning.deleteMany({ where: { eventDepartmentId: { in: eventDeptIds } } });
    await ctx.tx.eventDepartment.deleteMany({ where: { id: { in: eventDeptIds } } });
  }

  await ctx.tx.taskAssignment.deleteMany({ where: { eventId: { in: eventIds } } });
  await ctx.tx.eventReport.deleteMany({ where: { eventId: { in: eventIds } } });
  await ctx.tx.announcementEvent.deleteMany({ where: { eventId: { in: eventIds } } });

  // 3. Supprimer les events (FK propres grâce aux étapes précédentes)
  await ctx.tx.event.deleteMany({ where: { id: { in: eventIds } } });
}
