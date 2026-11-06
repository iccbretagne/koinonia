import { ApiError } from "@/lib/errors";
import { recordReceipt } from "./payments";
import { round } from "./rules";
import { itemHolds } from "./stock";

/**
 * Restauration (spec 074, lot 3) : remise des éléments « à retirer sur place », avec
 * encaissement s'il reste à régler, et vente sur place dans la limite du disponible.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

/**
 * Remise d'un élément. `delivered` est la quantité **totale** remise après le geste : rejouer
 * l'opération hors ligne ne remet rien de plus. Un élément à régler exige un encaissement.
 */
export async function deliverItem(
  eventId: string,
  input: { id: string; itemId: string; delivered: number; method?: "CASH" | "CHEQUE" | null; scannedAt: Date },
  userId: string
) {
  const prisma = await db();
  const item = await prisma.ticketingItem.findUnique({
    where: { id: input.itemId },
    include: { option: { select: { eventId: true, pickup: true } }, booking: { select: { status: true } } },
  });
  if (item?.option.eventId !== eventId || !item.option.pickup) throw new ApiError(404, "Élément introuvable");
  if (!itemHolds(item) || item.booking.status !== "ACTIVE") throw new ApiError(409, "Élément annulé ou libéré");
  const unpaid = item.status === "DUE" || item.status === "DECLARED";
  if (unpaid) {
    if (!input.method) throw new ApiError(409, "Élément à régler : encaissez avant de remettre.");
    await recordReceipt(eventId, item.bookingId, { method: input.method, charges: [{ type: "item", id: item.id }], opId: `${input.id}-pay` }, userId, "pickup");
  }
  const delivered = Math.min(item.quantity, Math.max(item.deliveredQty, input.delivered));
  if (delivered === item.deliveredQty) return { delivered, changed: false };
  await prisma.ticketingItem.update({
    where: { id: item.id },
    data: { deliveredQty: delivered, deliveredAt: input.scannedAt, deliveredById: userId },
  });
  return { delivered, changed: true };
}

/** Vente sur place (idempotente par l'identifiant d'opération), dans la limite du disponible. */
export async function recordOnsiteSale(
  eventId: string,
  input: { id: string; optionId: string; variantId?: string | null; quantity: number; method: "CASH" | "CHEQUE"; scannedAt: Date },
  userId: string
) {
  const prisma = await db();
  const existing = await prisma.ticketingOnsiteSale.findUnique({ where: { id: input.id }, select: { id: true } });
  if (existing) return { duplicate: true };
  const option = await prisma.ticketingOption.findUnique({ where: { id: input.optionId }, include: { variants: true } });
  if (option?.eventId !== eventId || !option.pickup) throw new ApiError(404, "Option introuvable");
  const variant = input.variantId ? option.variants.find((v) => v.id === input.variantId) : null;
  if (input.variantId && !variant) throw new ApiError(404, "Plat introuvable");
  if (!input.variantId && option.variants.length > 0) throw new ApiError(400, "Choisissez le plat");
  const base = variant ? variant.prepared ?? variant.stock : option.stock;
  if (base !== null && base !== undefined) {
    const where = variant ? { variantId: variant.id } : { optionId: option.id };
    const [reserved, sold] = await Promise.all([
      prisma.ticketingItem.aggregate({ where: { ...where, cancelledAt: null, status: { notIn: ["RELEASED", "CANCELLED"] } }, _sum: { quantity: true } }),
      prisma.ticketingOnsiteSale.aggregate({ where, _sum: { quantity: true } }),
    ]);
    const available = base - (reserved._sum.quantity ?? 0) - (sold._sum.quantity ?? 0);
    if (input.quantity > available) throw new ApiError(409, `Plus que ${Math.max(0, available)} disponible(s)`);
  }
  await prisma.ticketingOnsiteSale.create({
    data: {
      id: input.id,
      eventId,
      optionId: option.id,
      variantId: variant?.id ?? null,
      quantity: input.quantity,
      amount: round(Number(option.price) * input.quantity),
      method: input.method,
      soldById: userId,
      soldAt: input.scannedAt,
    },
  });
  return { duplicate: false };
}

/** Tableau de la restauration : à préparer par plat (payés et dus), remis, non retirés, ventes. */
export async function cateringBoard(eventId: string) {
  const { cateringSnapshot } = await import("./snapshot");
  const snap = await cateringSnapshot(eventId);
  const prisma = await db();
  const sales = await prisma.ticketingOnsiteSale.aggregate({ where: { eventId }, _sum: { amount: true, quantity: true } });
  const toPrepare = snap.stock.map((s) => {
    const items = snap.items.filter((i) => i.label === s.label);
    return {
      label: s.label,
      paid: items.filter((i) => i.paid).reduce((n, i) => n + i.quantity, 0),
      due: items.filter((i) => !i.paid).reduce((n, i) => n + i.quantity, 0),
      delivered: s.delivered,
      reserved: s.reserved,
      sold: s.sold,
      available: s.available,
      prepared: s.prepared,
      stock: s.stock,
    };
  });
  return {
    toPrepare,
    notCollected: snap.items.filter((i) => i.deliveredQty < i.quantity).map((i) => ({ holder: i.holder, label: i.label, missing: i.quantity - i.deliveredQty, paid: i.paid })),
    sales: { quantity: sales._sum.quantity ?? 0, amount: Number(sales._sum.amount ?? 0) },
  };
}
export type CateringBoard = Awaited<ReturnType<typeof cateringBoard>>;
