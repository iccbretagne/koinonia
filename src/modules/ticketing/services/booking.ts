import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import {
  paymentInstructions,
  readPaymentMethods,
  readQuestions,
  type BookingCreateInput,
  type BookingPatchInput,
  type ParticipantInput,
} from "../schemas";
import {
  appUrl,
  bookingConfirmedEmail,
  bookingUpdatedEmail,
  cancelledEmail,
  deliverToContact,
  manageUrl,
  recoverEmail,
  ticketUrl,
  type BookingMail,
} from "./emails";
import {
  balances,
  cancelledStatus,
  chargeStatusFor,
  checkAnswers,
  checkMinors,
  checkStock,
  formatReference,
  planSelections,
  refundableNow,
  round,
  type Charge,
  type PlannedItem,
  type RuleOption,
} from "./rules";
import { computeUsage, itemHolds } from "./stock";
import { deriveToken, hashToken, isTokenShape, newSalt, tokenPair } from "./tokens";
import { closedReason } from "./events";

/**
 * Réservations (spec 074) : inscription publique sous verrou de l'événement, gestion par le
 * lien personnel, annulations et états de remboursement, « Retrouver ma réservation ».
 */

type Tx = Prisma.TransactionClient;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const NOT_FOUND = "Réservation introuvable";

const EVENT_INCLUDE = {
  church: { select: { name: true, slug: true } },
  tariffs: true,
  options: { include: { variants: true } },
} as const;
type EventWithRules = Prisma.TicketingEventGetPayload<{ include: typeof EVENT_INCLUDE }>;

function ruleOptions(event: EventWithRules): Map<string, RuleOption> {
  return new Map(
    event.options.map((o) => [
      o.id,
      {
        id: o.id,
        label: o.label,
        type: o.type,
        scope: o.scope,
        price: Number(o.price),
        stock: o.stock,
        active: o.active,
        refundable: o.refundable,
        refundDeadline: o.refundDeadline,
        variants: o.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock, closed: v.closed })),
      },
    ])
  );
}

function entryPrice(event: EventWithRules, ageGroup: ParticipantInput["ageGroup"]): number {
  const tariff = event.tariffs.find((t) => t.ageGroup === ageGroup);
  if (!tariff) throw new ApiError(400, "Tranche d'âge non proposée pour cet événement");
  return Number(tariff.price);
}

/** Verrou de l'événement pour la durée de la transaction (ligne mise à jour). */
async function lockEvent(tx: Tx, eventId: string, takeReference = false) {
  return tx.ticketingEvent.update({
    where: { id: eventId },
    data: takeReference ? { nextReference: { increment: 1 } } : { updatedAt: new Date() },
    include: EVENT_INCLUDE,
  });
}

function participantRows(
  event: EventWithRules,
  bookingId: string,
  salt: string,
  participants: ParticipantInput[]
) {
  return participants.map((p) => {
    const id = randomUUID();
    const price = entryPrice(event, p.ageGroup);
    return {
      id,
      bookingId,
      eventId: event.id,
      firstName: p.firstName,
      lastName: p.lastName,
      ageGroup: p.ageGroup,
      ticketTokenHash: tokenPair("ticket", id, salt).hash,
      entryPrice: price,
      entryStatus: chargeStatusFor(price),
    };
  });
}

function itemRows(bookingId: string, participantIds: (string | null)[], planned: PlannedItem[]) {
  return planned.map((p) => ({
    id: randomUUID(),
    bookingId,
    participantId: p.holder === null ? null : participantIds[p.holder],
    optionId: p.optionId,
    variantId: p.variantId,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    status: p.status,
  }));
}

/** Inscription publique : contrôles, prix figés, référence, jetons, en une transaction. */
export async function createBooking(eventId: string, input: BookingCreateInput) {
  const prisma = await db();
  const account = await prisma.user.findUnique({ where: { email: input.contact.email }, select: { id: true } });

  const result = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId, true);
    const usage = await computeUsage(eventId, tx);
    const reason = closedReason(event, event.seatsOpen - usage.seatsTaken);
    if (reason) throw new ApiError(409, reason);
    if (usage.seatsTaken + input.participants.length > event.seatsOpen) {
      const left = Math.max(0, event.seatsOpen - usage.seatsTaken);
      throw new ApiError(409, `Il ne reste que ${left} place${left > 1 ? "s" : ""}.`);
    }
    checkMinors(
      input.participants.map((p) => p.ageGroup),
      event.allowUnaccompaniedMinors,
      !!input.guardian
    );
    const answers = checkAnswers(readQuestions(event.questions), input.answers);
    const options = ruleOptions(event);
    const planned = [
      ...input.participants.flatMap((p, i) => planSelections(i, p.options, options)),
      ...planSelections(null, input.bookingOptions, options),
    ];
    checkStock(planned, options, usage);

    const bookingId = randomUUID();
    const salt = newSalt();
    const reference = formatReference(event.referencePrefix, event.nextReference - 1);
    const unaccompanied = !input.participants.some((p) => p.ageGroup === "ADULT");
    await tx.ticketingBooking.create({
      data: {
        id: bookingId,
        eventId,
        reference,
        contactName: input.contact.name,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        userId: account?.id ?? null,
        guardianName: unaccompanied ? input.guardian?.name ?? null : null,
        guardianPhone: unaccompanied ? input.guardian?.phone ?? null : null,
        guardianConsentAt: unaccompanied && input.guardian ? new Date() : null,
        answers,
        tokenSalt: salt,
        manageTokenHash: tokenPair("manage", bookingId, salt).hash,
        scanTokenHash: tokenPair("scan", bookingId, salt).hash,
      },
    });
    const participants = participantRows(event, bookingId, salt, input.participants);
    await tx.ticketingParticipant.createMany({ data: participants });
    const items = itemRows(bookingId, participants.map((p) => p.id), planned);
    if (items.length > 0) await tx.ticketingItem.createMany({ data: items });
    return { bookingId, reference, salt, seatsLeft: event.seatsOpen - usage.seatsTaken - participants.length, event };
  });

  await notifyContact(result.bookingId, "TICKETING_BOOKED", "confirmed");
  await maybeAlertSeats(result.event.id, result.seatsLeft);
  return { bookingId: result.bookingId, reference: result.reference, manageToken: deriveToken("manage", result.bookingId, result.salt) };
}

function seatsMessage(seatsLeft: number): string {
  if (seatsLeft <= 0) return "Toutes les places sont prises.";
  return seatsLeft === 1 ? "Plus qu'une place disponible." : `Plus que ${seatsLeft} places disponibles.`;
}

/** Prévient les organisateurs quand les places restantes passent sous 10 % (une fois). */
async function maybeAlertSeats(eventId: string, seatsLeft: number) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUnique({ where: { id: eventId }, select: { seatsOpen: true, seatsAlertSent: true, title: true } });
  if (!event || event.seatsAlertSent || seatsLeft > event.seatsOpen * 0.1) return;
  const claimed = await prisma.ticketingEvent.updateMany({ where: { id: eventId, seatsAlertSent: false }, data: { seatsAlertSent: true } });
  if (claimed.count === 0) return;
  const { notifyEventTeam } = await import("./team-notify");
  await notifyEventTeam(eventId, ["ORGANIZER"], {
    type: "TICKETING_SEATS_LOW",
    title: `${event.title} : bientôt complet`,
    message: seatsMessage(seatsLeft),
    link: `/billetterie/${eventId}`,
  });
}

// ── Lecture d'une réservation ────────────────────────────────────────────────

const BOOKING_INCLUDE = {
  event: { include: EVENT_INCLUDE },
  participants: { orderBy: { createdAt: "asc" } },
  items: { orderBy: { createdAt: "asc" }, include: { option: true, variant: true } },
  payments: { orderBy: { createdAt: "desc" } },
} as const;
type FullBooking = Prisma.TicketingBookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export async function loadBooking(bookingId: string, client?: Tx): Promise<FullBooking> {
  const prisma = client ?? (await db());
  const booking = await prisma.ticketingBooking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
  if (!booking) throw new ApiError(404, NOT_FOUND);
  return booking;
}

/** Réservation désignée par son jeton de gestion ; 404 identique pour tout jeton inconnu. */
export async function bookingIdFromManageToken(token: string): Promise<string> {
  if (!isTokenShape(token)) throw new ApiError(404, NOT_FOUND);
  const prisma = await db();
  const booking = await prisma.ticketingBooking.findUnique({ where: { manageTokenHash: hashToken(token) }, select: { id: true } });
  if (!booking) throw new ApiError(404, NOT_FOUND);
  return booking.id;
}

function itemLabel(item: FullBooking["items"][number], participants: FullBooking["participants"]): string {
  const who = item.participantId ? participants.find((p) => p.id === item.participantId) : null;
  const what = item.variant ? `${item.option.label} — ${item.variant.label}` : item.option.label;
  const qty = item.quantity > 1 ? ` × ${item.quantity}` : "";
  const holder = who ? ` (${who.firstName})` : "";
  return `${what}${qty}${holder}`;
}

/** Éléments payants de la réservation (entrées et options), avec leur état. */
export function chargesOf(booking: Pick<FullBooking, "participants" | "items">): Charge[] {
  const entries: Charge[] = booking.participants
    .filter((p) => Number(p.entryPrice) > 0)
    .map((p) => ({ type: "entry", id: p.id, label: `Entrée ${p.firstName} ${p.lastName}`, amount: Number(p.entryPrice), status: p.entryStatus, pickup: false }));
  const items: Charge[] = booking.items
    .filter((i) => Number(i.unitPrice) * i.quantity > 0)
    .map((i) => ({
      type: "item",
      id: i.id,
      label: itemLabel(i as FullBooking["items"][number], booking.participants),
      amount: round(Number(i.unitPrice) * i.quantity),
      status: i.status,
      pickup: (i as FullBooking["items"][number]).option?.pickup ?? false,
    }));
  return [...entries, ...items];
}

export function bookingMail(booking: FullBooking): BookingMail {
  const config = readPaymentMethods(booking.event.paymentMethods);
  const b = balances(chargesOf(booking));
  return {
    event: { title: booking.event.title, startsAt: booking.event.startsAt, location: booking.event.location, churchName: booking.event.church.name },
    contactName: booking.contactName,
    reference: booking.reference,
    manageUrl: manageUrl(deriveToken("manage", booking.id, booking.tokenSalt)),
    tickets: booking.participants
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({ name: `${p.firstName} ${p.lastName}`, url: ticketUrl(deriveToken("ticket", p.id, booking.tokenSalt)) })),
    balances: b,
    instructions: paymentInstructions(booking.reference, config),
  };
}

type MailKind = "confirmed" | { updated: string } | { cancelled: string; refund: string | null };

/** Email récapitulatif au contact de la réservation. */
export async function notifyContact(bookingId: string, type: string, kind: MailKind) {
  const booking = await loadBooking(bookingId);
  const mail = bookingMail(booking);
  let content: { subject: string; html: string };
  let message: string;
  if (kind === "confirmed") {
    content = bookingConfirmedEmail(mail);
    message = `Réservation ${booking.reference} enregistrée.`;
  } else if ("updated" in kind) {
    content = bookingUpdatedEmail(mail, kind.updated);
    message = kind.updated;
  } else {
    content = cancelledEmail(mail, kind.cancelled, kind.refund);
    message = kind.cancelled;
  }
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, content, {
    type,
    title: booking.event.title,
    message,
  });
}

/** Vue « Ma réservation » (titulaire du lien de gestion). */
export async function getBookingView(bookingId: string) {
  const booking = await loadBooking(bookingId);
  const event = booking.event;
  const now = new Date();
  const config = readPaymentMethods(event.paymentMethods);
  const charges = chargesOf(booking);
  const usage = await computeUsage(event.id, await db());
  const seatsLeft = event.seatsOpen - usage.seatsTaken;
  const active = booking.status === "ACTIVE";
  const optionDeadlinePassed = !!event.optionPaymentDeadline && now > event.optionPaymentDeadline;
  const optionsById = new Map(event.options.map((o) => [o.id, o]));
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    contact: { name: booking.contactName, email: booking.contactEmail, phone: booking.contactPhone },
    guardian: booking.guardianName ? { name: booking.guardianName, phone: booking.guardianPhone } : null,
    event: {
      id: event.id,
      title: event.title,
      churchName: event.church.name,
      churchSlug: event.church.slug,
      slug: event.slug,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      location: event.location,
      status: event.status,
      optionPaymentDeadline: event.optionPaymentDeadline?.toISOString() ?? null,
      allowOnsitePayment: event.allowOnsitePayment,
    },
    scanCode: `KOINONIA-RESA:${deriveToken("scan", booking.id, booking.tokenSalt)}`,
    participants: booking.participants.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      ageGroup: p.ageGroup,
      status: p.status,
      entryPrice: Number(p.entryPrice),
      entryStatus: p.entryStatus,
      ticketUrl: p.status === "ACTIVE" ? ticketUrl(deriveToken("ticket", p.id, booking.tokenSalt)) : null,
      refundableNow: refundableNow(event.entryRefundable, event.entryRefundDeadline, now),
    })),
    items: booking.items.map((i) => ({
      id: i.id,
      participantId: i.participantId,
      optionId: i.optionId,
      variantId: i.variantId,
      label: itemLabel(i, booking.participants),
      quantity: i.quantity,
      amount: round(Number(i.unitPrice) * i.quantity),
      status: i.status,
      active: itemHolds(i),
      refundableNow: refundableNow(optionsById.get(i.optionId)?.refundable ?? false, optionsById.get(i.optionId)?.refundDeadline ?? null, now),
    })),
    balances: balances(charges),
    payments: booking.payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      method: p.method,
      amount: Number(p.amount),
      reason: p.reason,
      createdAt: p.createdAt.toISOString(),
    })),
    instructions: paymentInstructions(booking.reference, config),
    remoteMethods: (["WERO", "REVOLUT", "TRANSFER"] as const).filter((m) => !!{ WERO: config.wero, REVOLUT: config.revolut, TRANSFER: config.transfer }[m]),
    can: {
      editOptions: active && event.status !== "ARCHIVED" && !optionDeadlinePassed && now < event.startsAt,
      addParticipant: active && closedReason(event, seatsLeft, now) === null,
      rename: active && now < event.startsAt,
      cancel: active && event.status !== "ARCHIVED" && now < event.endsAt,
      declare: active && charges.some((c) => c.status === "DUE"),
    },
    appUrl: appUrl(),
  };
}
export type BookingView = Awaited<ReturnType<typeof getBookingView>>;

// ── Modifications par le titulaire ───────────────────────────────────────────

function holderKey(participantId: string | null, optionId: string) {
  return `${participantId ?? "booking"}:${optionId}`;
}

type HeldItem = FullBooking["items"][number];
type WantedItem = PlannedItem & { participantId: string | null };

/** Quantités supplémentaires demandées (nouvelles options, plat changé, quantité augmentée). */
function stockAdditions(current: Map<string, HeldItem>, wanted: Map<string, WantedItem>) {
  const additions: { optionId: string; variantId: string | null; quantity: number }[] = [];
  for (const [key, want] of wanted) {
    const have = current.get(key);
    if (!have || have.variantId !== want.variantId) {
      additions.push({ optionId: want.optionId, variantId: want.variantId, quantity: want.quantity });
    } else if (have.quantity < want.quantity) {
      additions.push({ optionId: want.optionId, variantId: want.variantId, quantity: want.quantity - have.quantity });
    }
  }
  return additions;
}

/** Mises à jour d'un élément existant : retrait (règles de remboursement), plat, quantité. */
function itemChanges(have: HeldItem, want: WantedItem | undefined, option: RuleOption | undefined, now: Date) {
  if (!want) {
    const status = cancelledStatus(have.status, refundableNow(option?.refundable ?? false, option?.refundDeadline ?? null, now));
    return [{ id: have.id, data: { status, cancelledAt: now, labelVersion: { increment: 1 } } satisfies Prisma.TicketingItemUncheckedUpdateInput }];
  }
  const data: Prisma.TicketingItemUncheckedUpdateInput = {};
  if (have.variantId !== want.variantId) {
    // Changement de plat : même élément (même prix), étiquette à refaire.
    data.variantId = want.variantId;
    data.labelVersion = { increment: 1 };
  }
  if (have.quantity !== want.quantity) {
    if (have.status !== "DUE" && have.status !== "FREE") {
      throw new ApiError(409, `« ${option?.label ?? "Option"} » est déjà réglée : sa quantité ne se modifie plus ici.`);
    }
    data.quantity = want.quantity;
    data.status = chargeStatusFor(Number(have.unitPrice) * want.quantity);
  }
  return Object.keys(data).length > 0 ? [{ id: have.id, data }] : [];
}

/** Applique le nouveau choix d'options de la réservation, dans la limite du stock. */
async function updateOptions(tx: Tx, booking: FullBooking, input: Extract<BookingPatchInput, { action: "updateOptions" }>) {
  const event = await lockEvent(tx, booking.eventId);
  const now = new Date();
  if (event.optionPaymentDeadline && now > event.optionPaymentDeadline) {
    throw new ApiError(409, "La date limite de modification des options est passée.");
  }
  const options = ruleOptions(event);
  const activeParticipants = booking.participants.filter((p) => p.status === "ACTIVE");
  const indexOf = new Map(activeParticipants.map((p, i) => [p.id, i]));
  const desired: WantedItem[] = [];
  for (const entry of input.participants) {
    const index = indexOf.get(entry.participantId);
    if (index === undefined) throw new ApiError(404, "Participant introuvable");
    desired.push(...planSelections(index, entry.options, options).map((p) => ({ ...p, participantId: entry.participantId })));
  }
  desired.push(...planSelections(null, input.bookingOptions, options).map((p) => ({ ...p, participantId: null })));

  const current = new Map(booking.items.filter(itemHolds).map((i) => [holderKey(i.participantId, i.optionId), i]));
  const wanted = new Map(desired.map((d) => [holderKey(d.participantId, d.optionId), d]));
  checkStock(stockAdditions(current, wanted), options, await computeUsage(event.id, tx));
  const changes = [...current].flatMap(([key, have]) => itemChanges(have, wanted.get(key), options.get(have.optionId), now));
  await Promise.all(changes.map(({ id, data }) => tx.ticketingItem.update({ where: { id }, data })));
  const fresh = desired.filter((d) => !current.has(holderKey(d.participantId, d.optionId)));
  const created = itemRows(booking.id, fresh.map((d) => d.participantId), fresh.map((d, i) => ({ ...d, holder: i })));
  if (created.length > 0) await tx.ticketingItem.createMany({ data: created });
  return "Vos options ont été modifiées.";
}

async function addParticipant(tx: Tx, booking: FullBooking, input: ParticipantInput) {
  const event = await lockEvent(tx, booking.eventId);
  const usage = await computeUsage(event.id, tx);
  const reason = closedReason(event, event.seatsOpen - usage.seatsTaken);
  if (reason) throw new ApiError(409, reason);
  const groups = [...booking.participants.filter((p) => p.status === "ACTIVE").map((p) => p.ageGroup), input.ageGroup];
  checkMinors(groups, event.allowUnaccompaniedMinors, !!booking.guardianName);
  const options = ruleOptions(event);
  const planned = planSelections(0, input.options, options);
  checkStock(planned, options, usage);
  const [participant] = participantRows(event, booking.id, booking.tokenSalt, [input]);
  await tx.ticketingParticipant.create({ data: participant });
  const items = itemRows(booking.id, [participant.id], planned);
  if (items.length > 0) await tx.ticketingItem.createMany({ data: items });
  return `${input.firstName} ${input.lastName} a été ajouté(e) à la réservation.`;
}

function activeParticipant(booking: FullBooking, participantId: string) {
  const participant = booking.participants.find((p) => p.id === participantId && p.status === "ACTIVE");
  if (!participant) throw new ApiError(404, "Participant introuvable");
  return participant;
}

/** Annule un ou plusieurs participants (et leurs options), états de remboursement compris. */
async function cancelParticipants(tx: Tx, booking: FullBooking, participantIds: string[], wholeBooking: boolean) {
  const now = new Date();
  const event = booking.event;
  const entryRefund = refundableNow(event.entryRefundable, event.entryRefundDeadline, now);
  const ids = new Set(participantIds);
  const remainingGroups = booking.participants.filter((p) => p.status === "ACTIVE" && !ids.has(p.id)).map((p) => p.ageGroup);
  if (!wholeBooking && remainingGroups.length > 0) {
    checkMinors(remainingGroups, event.allowUnaccompaniedMinors, !!booking.guardianName);
  }
  const lastOne = remainingGroups.length === 0;
  const entries = booking.participants
    .filter((x) => ids.has(x.id) && x.status === "ACTIVE")
    .map((p) => ({ id: p.id, entryStatus: cancelledStatus(p.entryStatus, entryRefund) }));
  const optionsById = new Map(event.options.map((o) => [o.id, o]));
  const touched = booking.items.filter((i) => itemHolds(i) && ((i.participantId && ids.has(i.participantId)) || (lastOne && !i.participantId)));
  const items = touched.map((item) => {
    const option = optionsById.get(item.optionId);
    return { id: item.id, status: cancelledStatus(item.status, refundableNow(option?.refundable ?? false, option?.refundDeadline ?? null, now)) };
  });
  const keptPaid = entries.some((e) => e.entryStatus === "PAID") || items.some((i) => i.status === "PAID");
  await Promise.all([
    ...entries.map((e) => tx.ticketingParticipant.update({ where: { id: e.id }, data: { status: "CANCELLED", cancelledAt: now, entryStatus: e.entryStatus } })),
    ...items.map((i) => tx.ticketingItem.update({ where: { id: i.id }, data: { status: i.status, cancelledAt: now, labelVersion: { increment: 1 } } })),
  ]);
  if (lastOne) await tx.ticketingBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: now } });
  return { lastOne, keptPaid, pickup: touched.some((i) => optionsById.get(i.optionId)?.pickup) };
}

export interface PatchResult {
  message: string;
  cancelled?: { lastOne: boolean; keptPaid: boolean; pickup: boolean };
}

/** Modification par le titulaire du lien « Ma réservation ». */
export async function patchBooking(bookingId: string, input: BookingPatchInput): Promise<PatchResult> {
  const prisma = await db();
  const result = await prisma.$transaction(async (tx): Promise<PatchResult> => {
    const booking = await loadBooking(bookingId, tx);
    if (booking.status !== "ACTIVE") throw new ApiError(409, "Cette réservation est annulée.");
    if (booking.event.status === "ARCHIVED") throw new ApiError(409, "L'événement est clôturé.");
    const now = new Date();
    switch (input.action) {
      case "updateOptions":
        if (now >= booking.event.startsAt) throw new ApiError(409, "L'événement a commencé.");
        return { message: await updateOptions(tx, booking, input) };
      case "addParticipant":
        return { message: await addParticipant(tx, booking, input.participant) };
      case "renameParticipant": {
        if (now >= booking.event.startsAt) throw new ApiError(409, "L'événement a commencé : le nom ne se modifie plus.");
        activeParticipant(booking, input.participantId);
        await tx.ticketingParticipant.update({ where: { id: input.participantId }, data: { firstName: input.firstName, lastName: input.lastName } });
        await tx.ticketingItem.updateMany({ where: { participantId: input.participantId }, data: { labelVersion: { increment: 1 } } });
        return { message: `Le billet est désormais au nom de ${input.firstName} ${input.lastName}.` };
      }
      case "updatePhone":
        await tx.ticketingBooking.update({ where: { id: bookingId }, data: { contactPhone: input.phone } });
        return { message: "Votre numéro de téléphone a été mis à jour." };
      case "cancelParticipant": {
        const p = activeParticipant(booking, input.participantId);
        const cancelled = await cancelParticipants(tx, booking, [p.id], false);
        return { message: `La participation de ${p.firstName} ${p.lastName} est annulée.`, cancelled };
      }
      case "cancelBooking": {
        const cancelled = await cancelParticipants(tx, booking, booking.participants.map((p) => p.id), true);
        return { message: "Votre réservation est annulée.", cancelled };
      }
    }
  });
  await afterChange(bookingId, result);
  return result;
}

/** Annulation par l'organisateur. */
export async function cancelByOrganizer(bookingId: string, participantId: string | null) {
  const prisma = await db();
  const result = await prisma.$transaction(async (tx): Promise<PatchResult> => {
    const booking = await loadBooking(bookingId, tx);
    if (booking.status !== "ACTIVE") throw new ApiError(409, "Cette réservation est déjà annulée.");
    if (participantId) {
      const p = activeParticipant(booking, participantId);
      const cancelled = await cancelParticipants(tx, booking, [p.id], false);
      return { message: `La participation de ${p.firstName} ${p.lastName} a été annulée par l'organisation.`, cancelled };
    }
    const cancelled = await cancelParticipants(tx, booking, booking.participants.map((p) => p.id), true);
    return { message: "Votre réservation a été annulée par l'organisation.", cancelled };
  });
  await afterChange(bookingId, result);
  return result;
}

async function afterChange(bookingId: string, result: PatchResult) {
  if (!result.cancelled) {
    await notifyContact(bookingId, "TICKETING_UPDATED", { updated: result.message });
    return;
  }
  const refund = result.cancelled.keptPaid
    ? "Les montants déjà réglés pour des éléments non remboursables (ou hors délai) ne seront pas remboursés."
    : null;
  await notifyContact(bookingId, "TICKETING_CANCELLED", { cancelled: result.message, refund });
  if (result.cancelled.pickup) {
    const booking = await loadBooking(bookingId);
    const { notifyEventTeam } = await import("./team-notify");
    await notifyEventTeam(booking.eventId, ["CATERING"], {
      type: "TICKETING_PICKUP_CANCELLED",
      title: `${booking.event.title} : annulation`,
      message: `La réservation ${booking.reference} a annulé une option à retirer sur place.`,
      link: `/billetterie/${booking.eventId}`,
    });
  }
}

// ── Retrouver ma réservation ─────────────────────────────────────────────────

/**
 * Renvoie par email les liens des réservations actives de cet email pour l'événement. La
 * réponse à l'appelant est toujours la même (ne révèle pas qui est inscrit).
 */
export async function recoverBooking(eventId: string, email: string): Promise<void> {
  const prisma = await db();
  const bookings = await prisma.ticketingBooking.findMany({
    where: { eventId, contactEmail: email, status: "ACTIVE" },
    include: { event: { include: { church: { select: { name: true } } } } },
  });
  if (bookings.length === 0) return;
  const event = bookings[0].event;
  const mail = recoverEmail(
    { title: event.title, startsAt: event.startsAt, location: event.location, churchName: event.church.name },
    bookings.map((b) => ({ reference: b.reference, url: manageUrl(deriveToken("manage", b.id, b.tokenSalt)) }))
  );
  await deliverToContact({ userId: null, email }, mail, { type: "TICKETING_RECOVER", title: event.title, message: "Vos réservations" });
}

// ── Billet seul ──────────────────────────────────────────────────────────────

/** Billet désigné par son jeton : ce billet seul, sans les autres participants ni paiements. */
export async function getTicket(token: string) {
  if (!isTokenShape(token)) throw new ApiError(404, "Billet introuvable");
  const prisma = await db();
  const participant = await prisma.ticketingParticipant.findUnique({
    where: { ticketTokenHash: hashToken(token) },
    include: { booking: { select: { reference: true } }, event: { include: { church: { select: { name: true } } } } },
  });
  if (!participant) throw new ApiError(404, "Billet introuvable");
  return {
    firstName: participant.firstName,
    lastName: participant.lastName,
    ageGroup: participant.ageGroup,
    valid: participant.status === "ACTIVE",
    reference: participant.booking.reference,
    qr: ticketUrl(token),
    event: {
      title: participant.event.title,
      churchName: participant.event.church.name,
      startsAt: participant.event.startsAt.toISOString(),
      endsAt: participant.event.endsAt.toISOString(),
      location: participant.event.location,
    },
  };
}

// ── Mes réservations (compte connecté) ───────────────────────────────────────

export async function listMyBookings(userId: string) {
  const prisma = await db();
  const rows = await prisma.ticketingBooking.findMany({
    where: { userId, event: { status: { not: "ARCHIVED" } } },
    orderBy: { createdAt: "desc" },
    include: { event: { select: { title: true, startsAt: true, location: true, church: { select: { name: true } } } }, participants: { select: { status: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    participants: b.participants.filter((p) => p.status === "ACTIVE").length,
    event: { title: b.event.title, startsAt: b.event.startsAt.toISOString(), location: b.event.location, churchName: b.event.church.name },
    manageUrl: manageUrl(deriveToken("manage", b.id, b.tokenSalt)),
  }));
}

// ── Ajout sur place (accueil, lot 2) ─────────────────────────────────────────

/**
 * Réservation créée à l'entrée (source ONSITE), idempotente par l'identifiant d'opération de
 * l'appareil : les identifiants des participants s'en déduisent (`<op>-<n>`), ce qui permet à
 * l'appareil hors ligne de les compter présents avant la synchronisation.
 */
export async function createWalkIn(
  eventId: string,
  opId: string,
  input: { participants: ParticipantInput[]; phone?: string | null; method?: "CASH" | "CHEQUE" | null },
  userId: string
) {
  const prisma = await db();
  const bookingId = `walkin-${opId}`;
  const participantIds = input.participants.map((_, i) => `${opId}-${i}`);
  const existing = await prisma.ticketingBooking.findUnique({ where: { id: bookingId }, select: { id: true } });
  if (existing) return { bookingId, participantIds, duplicate: true };

  await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId, true);
    if (!event.allowWalkIns) throw new ApiError(409, "L'ajout sur place n'est pas autorisé pour cet événement.");
    if (event.status !== "OPEN" && event.status !== "CLOSED") throw new ApiError(409, "Événement non ouvert.");
    const usage = await computeUsage(eventId, tx);
    if (usage.seatsTaken + input.participants.length > event.capacity) throw new ApiError(409, "Jauge atteinte.");
    const salt = newSalt();
    const first = input.participants[0];
    await tx.ticketingBooking.create({
      data: {
        id: bookingId,
        eventId,
        reference: formatReference(event.referencePrefix, event.nextReference - 1),
        contactName: `${first.firstName} ${first.lastName}`,
        contactEmail: "",
        contactPhone: input.phone ?? null,
        answers: {},
        source: "ONSITE",
        tokenSalt: salt,
        manageTokenHash: tokenPair("manage", bookingId, salt).hash,
        scanTokenHash: tokenPair("scan", bookingId, salt).hash,
      },
    });
    const rows = participantRows(event, bookingId, salt, input.participants.map((p) => ({ ...p, options: [] }))).map((r, i) => ({
      ...r,
      id: participantIds[i],
      ticketTokenHash: tokenPair("ticket", participantIds[i], salt).hash,
    }));
    const paid = !!input.method;
    await tx.ticketingParticipant.createMany({
      data: rows.map((r) => ({ ...r, entryStatus: paid && r.entryStatus === "DUE" ? "PAID" : r.entryStatus })),
    });
    const due = rows.filter((r) => r.entryStatus === "DUE");
    if (paid && due.length > 0) {
      await tx.ticketingPayment.create({
        data: {
          bookingId,
          eventId,
          kind: "RECEIPT",
          status: "CONFIRMED",
          method: input.method!,
          amount: round(due.reduce((n, r) => n + r.entryPrice, 0)),
          chargeRefs: due.map((r) => ({ type: "entry", id: r.id })),
          opId: `${opId}-pay`,
          recordedById: userId,
          confirmedById: userId,
          confirmedAt: new Date(),
        },
      });
    }
  });
  return { bookingId, participantIds, duplicate: false };
}
