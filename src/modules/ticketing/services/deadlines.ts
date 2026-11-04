import { bookingMail, chargesOf, loadBooking } from "./booking";
import { dayBeforeEmail, deliverToContact, releasedEmail, reminderEmail } from "./emails";

/**
 * Échéances de la billetterie (spec 074), tâche cron `ticketing` toutes les 15 minutes.
 * Chaque étape est idempotente : horodatage par réservation (`reminderSentAt`,
 * `dayBeforeSentAt`), ou état qui ne se retrouve plus dans la sélection suivante.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const DAY = 24 * 60 * 60 * 1000;

/** Prend une relance (horodatage atomique) puis prévient le contact ; `true` si envoyée. */
async function remindBooking(id: string, deadline: Date, now: Date): Promise<boolean> {
  const prisma = await db();
  const claimed = await prisma.ticketingBooking.updateMany({ where: { id, reminderSentAt: null }, data: { reminderSentAt: now } });
  if (claimed.count === 0) return false;
  const booking = await loadBooking(id);
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, reminderEmail(bookingMail(booking), deadline), {
    type: "TICKETING_REMINDER",
    title: booking.event.title,
    message: "Un montant reste à régler sur votre réservation.",
  });
  return true;
}

async function remindEvent(event: { id: string; optionPaymentDeadline: Date | null; reminderDaysBefore: number }, now: Date): Promise<number> {
  const deadline = event.optionPaymentDeadline;
  if (!deadline || now.getTime() < deadline.getTime() - event.reminderDaysBefore * DAY) return 0;
  const prisma = await db();
  const bookings = await prisma.ticketingBooking.findMany({
    where: {
      eventId: event.id,
      status: "ACTIVE",
      reminderSentAt: null,
      OR: [
        { items: { some: { status: "DUE", cancelledAt: null } } },
        { participants: { some: { status: "ACTIVE", entryStatus: "DUE" } } },
      ],
    },
    select: { id: true },
  });
  const sent = await Promise.all(bookings.map(({ id }) => remindBooking(id, deadline, now)));
  return sent.filter(Boolean).length;
}

/** Relance avant la date limite de paiement des options, une seule fois par réservation. */
export async function sendPaymentReminders(now = new Date()) {
  const prisma = await db();
  const events = await prisma.ticketingEvent.findMany({
    where: { status: { in: ["OPEN", "CLOSED"] }, optionPaymentDeadline: { gt: now } },
    select: { id: true, optionPaymentDeadline: true, reminderDaysBefore: true },
  });
  const counts = await Promise.all(events.map((event) => remindEvent(event, now)));
  return counts.reduce((n, c) => n + c, 0);
}

async function releaseBooking(bookingId: string, ids: string[], now: Date) {
  const prisma = await db();
  const released = await prisma.ticketingItem.updateMany({
    where: { id: { in: ids }, status: "DUE" },
    data: { status: "RELEASED", cancelledAt: now, labelVersion: { increment: 1 } },
  });
  if (released.count === 0) return;
  const booking = await loadBooking(bookingId);
  const idSet = new Set(ids);
  const labels = chargesOf(booking).filter((c) => c.type === "item" && idSet.has(c.id)).map((c) => c.label);
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, releasedEmail(bookingMail(booking), labels), {
    type: "TICKETING_RELEASED",
    title: booking.event.title,
    message: "Des options non réglées ont été retirées de votre réservation.",
  });
}

/**
 * À la date limite, les options non réglées (ni payées ni déclarées) sont libérées : elles sortent
 * de la réservation et le stock est rendu. Exception : paiement sur place autorisé.
 */
export async function releaseUnpaidOptions(now = new Date()) {
  const prisma = await db();
  const items = await prisma.ticketingItem.findMany({
    where: {
      status: "DUE",
      cancelledAt: null,
      booking: { status: "ACTIVE", event: { status: { in: ["OPEN", "CLOSED"] }, allowOnsitePayment: false, optionPaymentDeadline: { lte: now } } },
    },
    select: { id: true, bookingId: true },
  });
  const byBooking = new Map<string, string[]>();
  for (const item of items) byBooking.set(item.bookingId, [...(byBooking.get(item.bookingId) ?? []), item.id]);
  await Promise.all([...byBooking].map(([bookingId, ids]) => releaseBooking(bookingId, ids, now)));
  return items.length;
}

async function dayBeforeBooking(id: string, now: Date): Promise<boolean> {
  const prisma = await db();
  const claimed = await prisma.ticketingBooking.updateMany({ where: { id, dayBeforeSentAt: null }, data: { dayBeforeSentAt: now } });
  if (claimed.count === 0) return false;
  const booking = await loadBooking(id);
  await deliverToContact({ userId: booking.userId, email: booking.contactEmail }, dayBeforeEmail(bookingMail(booking)), {
    type: "TICKETING_DAY_BEFORE",
    title: booking.event.title,
    message: "C'est demain : vos billets sont dans votre réservation.",
  });
  return true;
}

/** Rappel la veille : billets et informations pratiques. */
export async function sendDayBeforeReminders(now = new Date()) {
  const prisma = await db();
  const bookings = await prisma.ticketingBooking.findMany({
    where: {
      status: "ACTIVE",
      dayBeforeSentAt: null,
      event: { status: { in: ["OPEN", "CLOSED"] }, startsAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
    },
    select: { id: true },
  });
  const sent = await Promise.all(bookings.map(({ id }) => dayBeforeBooking(id, now)));
  return sent.filter(Boolean).length;
}

/** Clôture automatique 24 h après la fin : les rôles d'événement s'arrêtent. */
export async function archiveFinishedEvents(now = new Date()) {
  const prisma = await db();
  const result = await prisma.ticketingEvent.updateMany({
    where: { status: { in: ["OPEN", "CLOSED"] }, endsAt: { lt: new Date(now.getTime() - DAY) } },
    data: { status: "ARCHIVED", closedAt: now },
  });
  return result.count;
}

async function purgeEvent(eventId: string, now: Date) {
  const prisma = await db();
  await prisma.$transaction([
    prisma.ticketingBooking.updateMany({
      where: { eventId: eventId },
      data: {
        contactName: "Anonymisé",
        contactEmail: "",
        contactPhone: null,
        userId: null,
        guardianName: null,
        guardianPhone: null,
        answers: {},
      },
    }),
    prisma.ticketingParticipant.updateMany({ where: { eventId: eventId }, data: { firstName: "Participant", lastName: "" } }),
    prisma.ticketingPayment.updateMany({ where: { eventId: eventId }, data: { reason: null } }),
    prisma.ticketingAssignment.updateMany({ where: { eventId: eventId, guestName: { not: null } }, data: { guestName: "Intervenant" } }),
    prisma.ticketingEvent.update({ where: { id: eventId }, data: { purgedAt: now } }),
  ]);
}

/**
 * Purge des données nominatives après la durée de conservation : noms, contacts, réponses et
 * motifs anonymisés ; compteurs, montants et passages gardés.
 */
export async function purgeExpiredEvents(now = new Date()) {
  const prisma = await db();
  const events = await prisma.ticketingEvent.findMany({
    where: { status: "ARCHIVED", purgedAt: null, closedAt: { not: null } },
    select: { id: true, closedAt: true, retentionDays: true },
  });
  const due = events.filter((e) => !!e.closedAt && e.closedAt.getTime() + e.retentionDays * DAY <= now.getTime());
  await Promise.all(due.map((event) => purgeEvent(event.id, now)));
  return due.length;
}

export async function runTicketingDeadlines(now = new Date()) {
  return {
    reminders: await sendPaymentReminders(now),
    released: await releaseUnpaidOptions(now),
    dayBefore: await sendDayBeforeReminders(now),
    archived: await archiveFinishedEvents(now),
    purged: await purgeExpiredEvents(now),
  };
}
