import { EventBus } from "@/core/event-bus";
import type { IntegrationEvents } from "./events";

/**
 * Bus d'événements du module intégration — singleton process-level.
 *
 * Usage dans un handler API :
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   await integrationBus.emit("family.assigned", { tx, churchId, userId }, { ... });
 * });
 * ```
 */
export const integrationBus = new EventBus<IntegrationEvents>();
