import type { Prisma, TicketingChargeStatus, TicketingPaymentMethod } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { PAYMENT_METHOD_LABEL, formatEuros, type ChargeRef } from "../schemas";
import { bookingMail, chargesOf, loadBooking } from "./booking";
import { deliverToContact, paymentConfirmedEmail, paymentRejectedEmail } from "./emails";
import { round, type Charge } from "./rules";

/**
 * Règlements (spec 074) : l'état de paiement est porté par chaque élément payant (entrée ou
 * option). Une déclaration « J'ai payé » couvre les éléments dus à cet instant ; un encaissement
 * direct porte sur les éléments choisis ; un remboursement solde les éléments « à rembourser ».
 */

type Tx = Prisma.TransactionClient;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

function readRefs(value: unknown): ChargeRef[] {
  return Array.isArray(value) ? (value as ChargeRef[]).filter((r) => r && (r.type === "entry" || r.type === "item") && typeof r.id === "string") : [];
}

async function setChargeStatus(tx: Tx, ref: ChargeRef, status: TicketingChargeStatus) {
  if (ref.type === "entry") await tx.ticketingParticipant.update({ where: { id: ref.id }, data: { entryStatus: status } });
  else await tx.ticketingItem.update({ where: { id: ref.id }, data: { status, labelVersion: { increment: 1 } } });
}

function pickCharges(charges: Charge[], refs: ChargeRef[]): Charge[] {
  const byKey = new Map(charges.map((c) => [`${c.type}:${c.id}`, c]));
  return refs.map((r) => {
    const charge = byKey.get(`${r.type}:${r.id}`);
    if (!charge) throw new ApiError(404, "Élément introuvable dans cette réservation");
    return charge;
  });
}

/** « J'ai payé » : les éléments dus passent à déclaré ; le trésorier est prévenu. */
export async function declarePayment(bookingId: string, method: TicketingPaymentMethod) {
  const prisma = await db();
  const payment = await prisma.$transaction(async (tx) => {
    const booking = await loadBooking(bookingId, tx);
    if (booking.status !== "ACTIVE") throw new ApiError(409, "Cette réservation est annulée.");
    const due = chargesOf(booking).filter((c) => c.status === "DUE");
    if (due.length === 0) throw new ApiError(409, "Rien à régler sur cette réservation.");
    for (const c of due) await setChargeStatus(tx, c, "DECLARED");
    return tx.ticketingPayment.create({
      data: {
        bookingId,
        eventId: booking.eventId,
        kind: "DECLARATION",
        status: "PENDING",
        method,
        amount: round(due.reduce((n, c) => n + c.amount, 0)),
        chargeRefs: due.map((c) => ({ type: c.type, id: c.id })),
      },
      include: { booking: { select: { reference: true, event: { select: { title: true } } } } },
    });
  });
  const { notifyEventTeam } = await import("./team-notify");
  await notifyEventTeam(payment.eventId, ["TREASURER"], {
    type: "TICKETING_PAYMENT_DECLARED",
    title: `${payment.booking.event.title} : paiement déclaré`,
    message: `${payment.booking.reference} déclare ${formatEuros(Number(payment.amount))} par ${PAYMENT_METHOD_LABEL[method]}.`,
    link: `/billetterie/${payment.eventId}?vue=reglements`,
  });
  return payment;
}

async function pendingDeclaration(eventId: string, paymentId: string) {
  const prisma = await db();
  const payment = await prisma.ticketingPayment.findUnique({ where: { id: paymentId } });
  if (payment?.eventId !== eventId || payment.kind !== "DECLARATION") throw new ApiError(404, "Paiement introuvable");
  if (payment.status !== "PENDING") throw new ApiError(409, "Cette déclaration est déjà traitée.");
  return payment;
}

/**
 * Confirmation d'une déclaration : déclaré → payé. Un élément annulé entre-temps alors que son
 * paiement était déclaré passe à « à rembourser » (l'argent est bien arrivé).
 */
export async function confirmPayment(eventId: string, paymentId: string, userId: string) {
  const payment = await pendingDeclaration(eventId, paymentId);
  const prisma = await db();
  await prisma.$transaction(async (tx) => {
    const booking = await loadBooking(payment.bookingId, tx);
    const charges = new Map(chargesOf(booking).map((c) => [`${c.type}:${c.id}`, c]));
    for (const ref of readRefs(payment.chargeRefs)) {
      const charge = charges.get(`${ref.type}:${ref.id}`);
      if (charge?.status === "DECLARED") await setChargeStatus(tx, ref, "PAID");
      else if (charge?.status === "CANCELLED") await setChargeStatus(tx, ref, "REFUND_DUE");
    }
    await tx.ticketingPayment.update({ where: { id: paymentId }, data: { status: "CONFIRMED", confirmedById: userId, confirmedAt: new Date() } });
  });
  const booking = await loadBooking(payment.bookingId);
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, paymentConfirmedEmail(bookingMail(booking), Number(payment.amount)), {
    type: "TICKETING_PAYMENT_CONFIRMED",
    title: booking.event.title,
    message: `Paiement de ${formatEuros(Number(payment.amount))} confirmé.`,
  });
}

/** Refus d'une déclaration erronée, avec motif : les éléments déclarés repassent à régler. */
export async function rejectPayment(eventId: string, paymentId: string, userId: string, reason: string) {
  const payment = await pendingDeclaration(eventId, paymentId);
  const prisma = await db();
  await prisma.$transaction(async (tx) => {
    const booking = await loadBooking(payment.bookingId, tx);
    const charges = new Map(chargesOf(booking).map((c) => [`${c.type}:${c.id}`, c]));
    for (const ref of readRefs(payment.chargeRefs)) {
      if (charges.get(`${ref.type}:${ref.id}`)?.status === "DECLARED") await setChargeStatus(tx, ref, "DUE");
    }
    await tx.ticketingPayment.update({ where: { id: paymentId }, data: { status: "REJECTED", reason, confirmedById: userId, confirmedAt: new Date() } });
  });
  const booking = await loadBooking(payment.bookingId);
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, paymentRejectedEmail(bookingMail(booking), reason), {
    type: "TICKETING_PAYMENT_REJECTED",
    title: booking.event.title,
    message: `Déclaration de paiement refusée : ${reason}`,
  });
}

export type ReceiptScope = "all" | "entry" | "pickup";

/**
 * Encaissement direct (espèces, chèque…) sur les éléments choisis, à régler ou déclarés. La
 * portée limite ce que l'agent peut encaisser : l'accueil, les entrées ; la restauration, les
 * options à retirer. Idempotent par `opId` (opérations hors ligne).
 */
export async function recordReceipt(
  eventId: string,
  bookingId: string,
  input: { method: TicketingPaymentMethod; charges: ChargeRef[]; opId?: string },
  userId: string,
  scope: ReceiptScope = "all"
) {
  const prisma = await db();
  if (input.opId) {
    const existing = await prisma.ticketingPayment.findUnique({ where: { opId: input.opId } });
    if (existing) return existing;
  }
  return prisma.$transaction(async (tx) => {
    const booking = await loadBooking(bookingId, tx);
    if (booking.eventId !== eventId) throw new ApiError(404, "Réservation introuvable");
    const picked = pickCharges(chargesOf(booking), input.charges);
    if (scope === "entry" && picked.some((c) => c.type !== "entry")) throw new Error("FORBIDDEN");
    if (scope === "pickup" && picked.some((c) => c.type !== "item" || !c.pickup)) throw new Error("FORBIDDEN");
    const payable = picked.filter((c) => c.status === "DUE" || c.status === "DECLARED");
    if (payable.length === 0) throw new ApiError(409, "Ces éléments sont déjà réglés.");
    for (const c of payable) await setChargeStatus(tx, c, "PAID");
    return tx.ticketingPayment.create({
      data: {
        bookingId,
        eventId,
        kind: "RECEIPT",
        status: "CONFIRMED",
        method: input.method,
        amount: round(payable.reduce((n, c) => n + c.amount, 0)),
        chargeRefs: payable.map((c) => ({ type: c.type, id: c.id })),
        opId: input.opId,
        recordedById: userId,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
    });
  });
}

/** Remboursement : les éléments « à rembourser » choisis passent à remboursé. */
export async function markRefunded(
  eventId: string,
  bookingId: string,
  input: { method: TicketingPaymentMethod; charges: ChargeRef[] },
  userId: string
) {
  const prisma = await db();
  return prisma.$transaction(async (tx) => {
    const booking = await loadBooking(bookingId, tx);
    if (booking.eventId !== eventId) throw new ApiError(404, "Réservation introuvable");
    const picked = pickCharges(chargesOf(booking), input.charges).filter((c) => c.status === "REFUND_DUE");
    if (picked.length === 0) throw new ApiError(409, "Aucun élément à rembourser parmi ceux choisis.");
    for (const c of picked) await setChargeStatus(tx, c, "REFUNDED");
    return tx.ticketingPayment.create({
      data: {
        bookingId,
        eventId,
        kind: "REFUND",
        status: "CONFIRMED",
        method: input.method,
        amount: round(picked.reduce((n, c) => n + c.amount, 0)),
        chargeRefs: picked.map((c) => ({ type: c.type, id: c.id })),
        recordedById: userId,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
    });
  });
}

// ── Tableaux ─────────────────────────────────────────────────────────────────

/** Réservations de l'événement, avec dû / déclaré / payé / reste ; `withContact` pour l'organisation. */
export async function listBookings(eventId: string, withContact: boolean) {
  const prisma = await db();
  const bookings = await prisma.ticketingBooking.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      items: { include: { option: true, variant: true } },
    },
  });
  const { balances } = await import("./rules");
  return bookings.map((b) => {
    const charges = chargesOf(b as never);
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      source: b.source,
      createdAt: b.createdAt.toISOString(),
      contact: withContact ? { name: b.contactName, email: b.contactEmail, phone: b.contactPhone } : { name: b.contactName, email: null, phone: null },
      guardian: withContact && b.guardianName ? { name: b.guardianName, phone: b.guardianPhone } : null,
      answers: withContact ? (b.answers as Record<string, string>) : {},
      participants: b.participants.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        ageGroup: p.ageGroup,
        status: p.status,
        entryPrice: Number(p.entryPrice),
        entryStatus: p.entryStatus,
      })),
      charges: withContact ? charges : [],
      balances: balances(charges),
    };
  });
}

/** Paiements de l'événement : déclarés à confirmer en tête, encaissements, remboursements. */
export async function listPayments(eventId: string) {
  const prisma = await db();
  const payments = await prisma.ticketingPayment.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: { booking: { select: { reference: true, contactName: true } } },
  });
  return payments.map((p) => ({
    id: p.id,
    bookingId: p.bookingId,
    reference: p.booking.reference,
    contactName: p.booking.contactName,
    kind: p.kind,
    status: p.status,
    method: p.method,
    amount: Number(p.amount),
    reason: p.reason,
    createdAt: p.createdAt.toISOString(),
  }));
}

export type BookingRow = Awaited<ReturnType<typeof listBookings>>[number];
export type PaymentRow = Awaited<ReturnType<typeof listPayments>>[number];
