import type { Prisma, TicketingChargeStatus } from "@/generated/prisma/client";

/**
 * Places et stock (spec 074) : calculés à la lecture, jamais stockés. Un élément « tient » une
 * place de stock tant qu'il n'est ni retiré (`cancelledAt`), ni libéré, ni annulé.
 */

type Tx = Pick<Prisma.TransactionClient, "ticketingParticipant" | "ticketingItem" | "ticketingOnsiteSale">;

export const RELEASED_STATES: readonly TicketingChargeStatus[] = ["RELEASED", "CANCELLED"];

export function itemHolds(item: { cancelledAt: Date | null; status: TicketingChargeStatus }): boolean {
  return !item.cancelledAt && !RELEASED_STATES.includes(item.status);
}

export interface Usage {
  seatsTaken: number;
  /** Quantités tenues par option (réservées et vendues sur place). */
  options: Map<string, number>;
  variants: Map<string, number>;
}

/** Places prises et stock consommé de l'événement. */
export async function computeUsage(eventId: string, db: Tx): Promise<Usage> {
  const [seatsTaken, items, sales] = await Promise.all([
    db.ticketingParticipant.count({ where: { eventId, status: "ACTIVE" } }),
    db.ticketingItem.groupBy({
      by: ["optionId", "variantId"],
      where: { booking: { eventId }, cancelledAt: null, status: { notIn: [...RELEASED_STATES] } },
      _sum: { quantity: true },
    }),
    db.ticketingOnsiteSale.groupBy({
      by: ["optionId", "variantId"],
      where: { eventId },
      _sum: { quantity: true },
    }),
  ]);
  const options = new Map<string, number>();
  const variants = new Map<string, number>();
  for (const row of [...items, ...sales]) {
    const qty = row._sum.quantity ?? 0;
    options.set(row.optionId, (options.get(row.optionId) ?? 0) + qty);
    if (row.variantId) variants.set(row.variantId, (variants.get(row.variantId) ?? 0) + qty);
  }
  return { seatsTaken, options, variants };
}

export function remaining(stock: number | null, used: number): number | null {
  return stock === null ? null : Math.max(0, stock - used);
}
