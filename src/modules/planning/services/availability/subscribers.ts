import { planningBus } from "../../bus";
import { createAsks } from "./asks";
import { monthStart } from "./state";

/**
 * Abonnés du bus planning pour la collecte de disponibilités (spec 058). Ils tournent dans la
 * transaction de l'émetteur : aucune notification ici, l'envoi est différé au cron horaire.
 */
let registered = false;

export function registerAvailabilitySubscribers(): void {
  if (registered) return;
  registered = true;

  planningBus.on("planning:event:rescheduled", async ({ tx, userId }, { eventId, churchId, previousDate, newDate }) => {
    if (new Date(previousDate).getTime() === new Date(newDate).getTime()) return;
    await tx.availabilityResponse.deleteMany({ where: { eventId } });
    await tx.availabilityAsk.deleteMany({ where: { eventId } });
    if (!(await collectionIsOpen(tx, churchId, new Date(newDate)))) return;
    const depts = await tx.eventDepartment.findMany({ where: { eventId }, select: { departmentId: true } });
    await createAsks(tx, {
      eventId,
      departmentIds: depts.map((d) => d.departmentId),
      reason: "EVENT_MOVED",
      createdById: userId ?? null,
    });
  });

  planningBus.on("planning:event:departments:added", async ({ tx, userId }, { eventId, churchId, departmentIds }) => {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { date: true } });
    if (!event || !(await collectionIsOpen(tx, churchId, event.date))) return;
    await createAsks(tx, { eventId, departmentIds, reason: "EVENT_ADDED", createdById: userId ?? null });
  });
}

async function collectionIsOpen(
  tx: Parameters<typeof createAsks>[0],
  churchId: string,
  date: Date
): Promise<boolean> {
  const c = await tx.availabilityCollection.findUnique({
    where: { churchId_month: { churchId, month: monthStart(date) } },
    select: { id: true },
  });
  return c !== null;
}
