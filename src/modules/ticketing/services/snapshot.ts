import { round } from "./rules";
import { RELEASED_STATES } from "./stock";
import { hashToken, deriveToken } from "./tokens";
import { insideState } from "./presence";

/**
 * Instantané d'un écran de terrain (spec 074, lot 2 et 3) : tout ce qu'il faut pour contrôler ou
 * distribuer hors ligne, et rien de plus. Les codes y sont des **empreintes** (aucun jeton) : un
 * QR scanné est haché sur l'appareil puis comparé. L'accueil ne reçoit ni email, ni téléphone de
 * contact, ni montant d'option ; seul le téléphone du responsable légal d'un mineur non
 * accompagné y figure.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export const labelHash = (itemId: string, salt: string) => hashToken(deriveToken("label", itemId, salt));

async function base(eventId: string) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { id: true, title: true, capacity: true, allowWalkIns: true, startsAt: true, endsAt: true, tariffs: { select: { ageGroup: true, price: true } } },
  });
  return {
    id: event.id,
    title: event.title,
    capacity: event.capacity,
    allowWalkIns: event.allowWalkIns,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    tariffs: event.tariffs.map((t) => ({ ageGroup: t.ageGroup, price: Number(t.price) })),
  };
}

/** Instantané de l'accueil : participants, codes de réservation, badges, présences. */
export async function receptionSnapshot(eventId: string) {
  const prisma = await db();
  const [event, bookings, assignments, passages] = await Promise.all([
    base(eventId),
    prisma.ticketingBooking.findMany({
      where: { eventId },
      select: {
        id: true,
        reference: true,
        scanTokenHash: true,
        guardianName: true,
        guardianPhone: true,
        participants: { select: { id: true, firstName: true, lastName: true, ageGroup: true, ticketTokenHash: true, status: true, entryPrice: true, entryStatus: true } },
      },
    }),
    prisma.ticketingAssignment.findMany({
      where: { eventId },
      select: { id: true, badgeTokenHash: true, guestName: true, startsAt: true, endsAt: true, user: { select: { name: true, email: true } }, post: { select: { name: true } } },
    }),
    prisma.ticketingPassage.findMany({ where: { eventId }, select: { id: true, subject: true, participantId: true, assignmentId: true, direction: true, delta: true, scannedAt: true, receivedAt: true } }),
  ]);
  const { inside, manual } = insideState(passages);
  return {
    kind: "reception" as const,
    event,
    bookings: bookings.map((b) => ({ id: b.id, reference: b.reference, scanHash: b.scanTokenHash })),
    participants: bookings.flatMap((b) =>
      b.participants.map((p) => ({
        id: p.id,
        bookingId: b.id,
        firstName: p.firstName,
        lastName: p.lastName,
        ageGroup: p.ageGroup,
        ticketHash: p.ticketTokenHash,
        active: p.status === "ACTIVE",
        entryDue: p.entryStatus === "DUE" || p.entryStatus === "DECLARED" ? Number(p.entryPrice) : 0,
        unaccompanied: !!b.guardianName,
        guardianPhone: b.guardianName ? b.guardianPhone : null,
      }))
    ),
    badges: assignments.map((a) => ({
      id: a.id,
      hash: a.badgeTokenHash,
      name: a.user?.name ?? a.user?.email ?? a.guestName ?? "Intervenant",
      postName: a.post?.name ?? null,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
    inside: [...inside],
    manual,
    serverTime: new Date().toISOString(),
  };
}
export type ReceptionSnapshot = Awaited<ReturnType<typeof receptionSnapshot>>;

/** Instantané de la restauration : éléments à retirer, état de paiement, stock par plat. */
export async function cateringSnapshot(eventId: string) {
  const prisma = await db();
  const [event, options, items, sales] = await Promise.all([
    base(eventId),
    prisma.ticketingOption.findMany({
      where: { eventId, pickup: true },
      orderBy: { position: "asc" },
      include: { variants: { orderBy: { position: "asc" } } },
    }),
    prisma.ticketingItem.findMany({
      where: { option: { eventId, pickup: true }, cancelledAt: null, status: { notIn: [...RELEASED_STATES] } },
      include: {
        booking: { select: { id: true, reference: true, scanTokenHash: true, tokenSalt: true, status: true } },
        participant: { select: { id: true, firstName: true, lastName: true, ticketTokenHash: true } },
        variant: { select: { label: true, allergens: true } },
        option: { select: { label: true, namedPrep: true } },
      },
    }),
    prisma.ticketingOnsiteSale.groupBy({ by: ["variantId", "optionId"], where: { eventId }, _sum: { quantity: true } }),
  ]);
  const sold = new Map(sales.map((s) => [s.variantId ?? s.optionId, s._sum.quantity ?? 0]));
  const stock = options.flatMap((o) => {
    const groups = o.variants.length > 0 ? o.variants.map((v) => ({ key: v.id, label: v.label, stock: v.stock, prepared: v.prepared, closed: v.closed, filter: (i: (typeof items)[number]) => i.variantId === v.id })) : [{ key: o.id, label: o.label, stock: o.stock, prepared: null, closed: !o.active, filter: (i: (typeof items)[number]) => i.optionId === o.id }];
    return groups.map((g) => {
      const mine = items.filter(g.filter);
      const reserved = mine.reduce((n, i) => n + i.quantity, 0);
      const delivered = mine.reduce((n, i) => n + i.deliveredQty, 0);
      const onsite = sold.get(g.key) ?? 0;
      const base = g.prepared ?? g.stock;
      return {
        optionId: o.id,
        variantId: o.variants.length > 0 ? g.key : null,
        label: o.variants.length > 0 ? `${o.label} — ${g.label}` : o.label,
        price: Number(o.price),
        closed: g.closed,
        stock: g.stock,
        prepared: g.prepared,
        reserved,
        delivered,
        sold: onsite,
        /** Disponible à la vente sur place : préparés (à défaut stock) moins réservés et vendus. */
        available: base === null ? null : Math.max(0, base - reserved - onsite),
      };
    });
  });
  const bookings = new Map<string, { id: string; reference: string; scanHash: string }>();
  const participants = new Map<string, { id: string; bookingId: string; name: string; ticketHash: string }>();
  for (const i of items) {
    bookings.set(i.booking.id, { id: i.booking.id, reference: i.booking.reference, scanHash: i.booking.scanTokenHash });
    if (i.participant) participants.set(i.participant.id, { id: i.participant.id, bookingId: i.booking.id, name: `${i.participant.firstName} ${i.participant.lastName}`, ticketHash: i.participant.ticketTokenHash });
  }
  return {
    kind: "catering" as const,
    event,
    bookings: [...bookings.values()],
    participants: [...participants.values()],
    items: items
      .filter((i) => i.booking.status === "ACTIVE")
      .map((i) => ({
        id: i.id,
        bookingId: i.booking.id,
        participantId: i.participantId,
        holder: i.participant ? `${i.participant.firstName} ${i.participant.lastName}` : `Réservation ${i.booking.reference}`,
        label: i.variant ? `${i.option.label} — ${i.variant.label}` : i.option.label,
        allergens: i.variant?.allergens ?? null,
        quantity: i.quantity,
        deliveredQty: i.deliveredQty,
        paid: i.status === "PAID" || i.status === "FREE",
        amountDue: i.status === "DUE" || i.status === "DECLARED" ? round(Number(i.unitPrice) * i.quantity) : 0,
        labelHash: i.option.namedPrep ? labelHash(i.id, i.booking.tokenSalt) : null,
        labelStale: i.option.namedPrep && i.labelPrintedVersion !== null && i.labelPrintedVersion !== i.labelVersion,
      })),
    stock,
    sale: options.map((o) => ({
      id: o.id,
      label: o.label,
      price: Number(o.price),
      variants: o.variants.filter((v) => !v.closed).map((v) => ({ id: v.id, label: v.label })),
    })),
    serverTime: new Date().toISOString(),
  };
}
export type CateringSnapshot = Awaited<ReturnType<typeof cateringSnapshot>>;
