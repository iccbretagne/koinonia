import { ApiError } from "@/lib/errors";
import type { variantCreateSchema, variantSchema } from "../schemas";
import type { z } from "zod";

/**
 * Menu d'une option à retirer sur place (spec 074, lot 3) : la restauration (et l'organisateur)
 * ajoute, renomme et décrit les plats, indique les allergènes, fixe le stock et les préparés, ferme
 * un plat. L'existence de l'option, son prix et ses règles restent à l'organisateur (routes et
 * schémas distincts). Limites : un plat réservé ne se supprime pas (il se ferme) ; le stock ne
 * descend pas sous le nombre réservé. Chaque changement est journalisé.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string, churchId: string, action: "CREATE" | "UPDATE" | "DELETE", entityId: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action, entityType: "TicketingOption", entityId, details });
}

async function optionInEvent(eventId: string, optionId: string) {
  const prisma = await db();
  const option = await prisma.ticketingOption.findUnique({ where: { id: optionId }, include: { event: { select: { churchId: true } } } });
  if (option?.eventId !== eventId) throw new ApiError(404, "Option introuvable");
  if (option.type !== "CHOICE") throw new ApiError(400, "Seule une option à choix porte un menu");
  return option;
}

async function variantInEvent(eventId: string, variantId: string) {
  const prisma = await db();
  const variant = await prisma.ticketingVariant.findUnique({ where: { id: variantId }, include: { option: { include: { event: { select: { churchId: true } } } } } });
  if (variant?.option.eventId !== eventId) throw new ApiError(404, "Plat introuvable");
  return variant;
}

/** Quantité réservée (non annulée, non libérée) d'un plat. */
async function reservedOf(variantId: string): Promise<number> {
  const prisma = await db();
  const [items, sales] = await Promise.all([
    prisma.ticketingItem.aggregate({ where: { variantId, cancelledAt: null, status: { notIn: ["RELEASED", "CANCELLED"] } }, _sum: { quantity: true } }),
    prisma.ticketingOnsiteSale.aggregate({ where: { variantId }, _sum: { quantity: true } }),
  ]);
  return (items._sum.quantity ?? 0) + (sales._sum.quantity ?? 0);
}

export async function addVariant(eventId: string, optionId: string, userId: string, input: z.infer<typeof variantCreateSchema>) {
  const option = await optionInEvent(eventId, optionId);
  const prisma = await db();
  const position = await prisma.ticketingVariant.count({ where: { optionId } });
  const variant = await prisma.ticketingVariant.create({
    data: { optionId, label: input.label, description: input.description, allergens: input.allergens, stock: input.stock ?? null, position },
  });
  await audit(userId, option.event.churchId, "UPDATE", optionId, { menu: "ajout", variant: variant.label });
  return variant;
}

export async function updateVariant(eventId: string, variantId: string, userId: string, input: z.infer<typeof variantSchema>) {
  const variant = await variantInEvent(eventId, variantId);
  if (input.stock !== undefined && input.stock !== null) {
    const reserved = await reservedOf(variantId);
    if (input.stock < reserved) throw new ApiError(400, `Déjà ${reserved} réservé(s) : le stock ne descend pas en dessous`);
  }
  const prisma = await db();
  const updated = await prisma.ticketingVariant.update({ where: { id: variantId }, data: input });
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof typeof input)[]) before[key] = variant[key as keyof typeof variant];
  await audit(userId, variant.option.event.churchId, "UPDATE", variant.optionId, { menu: "modification", variant: variant.label, before, after: input });
  return updated;
}

/** Un plat jamais réservé se supprime ; un plat réservé se ferme seulement (409). */
export async function deleteVariant(eventId: string, variantId: string, userId: string) {
  const variant = await variantInEvent(eventId, variantId);
  const prisma = await db();
  const [items, sales] = await Promise.all([prisma.ticketingItem.count({ where: { variantId } }), prisma.ticketingOnsiteSale.count({ where: { variantId } })]);
  if (items + sales > 0) throw new ApiError(409, "Plat déjà réservé : fermez-le aux nouvelles commandes au lieu de le supprimer.");
  await prisma.ticketingVariant.delete({ where: { id: variantId } });
  await audit(userId, variant.option.event.churchId, "UPDATE", variant.optionId, { menu: "suppression", variant: variant.label });
}
