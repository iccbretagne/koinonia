import { ApiError } from "@/lib/errors";
import { RELEASED_STATES } from "./stock";
import { deriveToken } from "./tokens";
import { QR_PREFIX, readQuestions } from "../schemas";

/**
 * Étiquettes de préparation nominative (spec 074, lot 3), pour les options `namedPrep` : nom,
 * plat, allergies (réponses aux questions dont le libellé parle d'allergie), référence, mention
 * « à régler », et un code d'étiquette facultatif — il ouvre la fiche de distribution, jamais
 * l'entrée. `labelVersion` change avec le plat, le nom ou l'état de l'élément : une étiquette
 * imprimée sur une version antérieure est « à refaire ».
 */

export type LabelSet = "all" | "variant" | "booking" | "changed";

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export const labelCode = (itemId: string, salt: string) => `${QR_PREFIX.label}${deriveToken("label", itemId, salt)}`;

export async function listLabels(eventId: string, set: LabelSet, filter: { variantId?: string; bookingId?: string } = {}) {
  if (set === "variant" && !filter.variantId) throw new ApiError(400, "Plat requis");
  if (set === "booking" && !filter.bookingId) throw new ApiError(400, "Réservation requise");
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { questions: true } });
  const allergyIds = readQuestions(event.questions)
    .filter((q) => /allerg/i.test(q.label))
    .map((q) => q.id);
  const items = await prisma.ticketingItem.findMany({
    where: {
      option: { eventId, namedPrep: true },
      cancelledAt: null,
      status: { notIn: [...RELEASED_STATES] },
      booking: { status: "ACTIVE" },
      ...(set === "variant" ? { variantId: filter.variantId } : {}),
      ...(set === "booking" ? { bookingId: filter.bookingId } : {}),
    },
    orderBy: [{ variantId: "asc" }, { createdAt: "asc" }],
    include: {
      option: { select: { label: true } },
      variant: { select: { label: true, allergens: true } },
      participant: { select: { firstName: true, lastName: true } },
      booking: { select: { reference: true, contactName: true, tokenSalt: true, answers: true } },
    },
  });
  return items
    .filter((i) => set !== "changed" || i.labelPrintedVersion !== i.labelVersion)
    .map((i) => {
      const answers = (i.booking.answers ?? {}) as Record<string, string>;
      return {
        itemId: i.id,
        name: i.participant ? `${i.participant.firstName} ${i.participant.lastName}` : i.booking.contactName,
        dish: i.variant ? i.variant.label : i.option.label,
        option: i.option.label,
        quantity: i.quantity,
        allergies: allergyIds.map((id) => answers[id]).filter(Boolean).join(", ") || null,
        allergens: i.variant?.allergens ?? null,
        reference: i.booking.reference,
        toPay: i.status === "DUE" || i.status === "DECLARED",
        code: labelCode(i.id, i.booking.tokenSalt),
        stale: i.labelPrintedVersion !== null && i.labelPrintedVersion !== i.labelVersion,
        printed: i.labelPrintedVersion === i.labelVersion,
      };
    });
}
export type LabelRow = Awaited<ReturnType<typeof listLabels>>[number];

/** Marque imprimées les étiquettes choisies, à leur version courante. */
export async function markPrinted(eventId: string, itemIds: string[]) {
  const prisma = await db();
  const items = await prisma.ticketingItem.findMany({
    where: { id: { in: itemIds }, option: { eventId, namedPrep: true } },
    select: { id: true, labelVersion: true },
  });
  const now = new Date();
  await prisma.$transaction(items.map((i) => prisma.ticketingItem.update({ where: { id: i.id }, data: { labelPrintedVersion: i.labelVersion, labelPrintedAt: now } })));
  return { printed: items.length };
}
