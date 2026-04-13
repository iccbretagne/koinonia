import { EventBus } from "@/core/event-bus";
import type { PlanningEvents } from "./events";

/**
 * Bus d'événements du module planning — singleton process-level.
 *
 * Les autres modules (discipleship, media…) s'y abonnent via `planningBus.on()`
 * lors du démarrage du process (ex. dans leur propre init ou dans @/lib/registry).
 *
 * Usage dans un handler API :
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   const event = await tx.event.create({ ... });
 *   await planningBus.emit("planning:event:created", { tx, churchId, userId }, {
 *     eventId: event.id, ...
 *   });
 * });
 * ```
 */
export const planningBus = new EventBus<PlanningEvents>();
