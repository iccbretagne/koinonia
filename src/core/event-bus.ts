import type { Prisma } from "@/generated/prisma/client";

export interface EventContext {
  tx: Prisma.TransactionClient;
  churchId: string;
  userId?: string;
}

export type EventHandler<TPayload> = (
  ctx: EventContext,
  payload: TPayload
) => Promise<void>;

/**
 * Bus d'événements typé, in-process, transaction-aware.
 *
 * Les handlers sont exécutés séquentiellement dans l'ordre d'enregistrement,
 * au sein de la transaction Prisma fournie via le contexte. Si un handler throw,
 * l'émission est interrompue et l'erreur remonte — la transaction sera rollback
 * par l'appelant.
 */
export class EventBus<TEvents extends Record<string, unknown>> {
  private handlers = new Map<keyof TEvents, EventHandler<unknown>[]>();

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler as EventHandler<unknown>);
    this.handlers.set(event, existing);
  }

  async emit<K extends keyof TEvents>(
    event: K,
    ctx: EventContext,
    payload: TEvents[K]
  ): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    for (const handler of handlers) {
      await (handler as EventHandler<TEvents[K]>)(ctx, payload);
    }
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
