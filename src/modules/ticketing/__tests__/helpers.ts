import { vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

/** Événement de billetterie complet (tarifs, options, église), tel que le renvoie le verrou. */
export function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    churchId: "church-1",
    slug: "nuit",
    title: "Nuit de la traversée",
    description: null,
    location: "Rennes",
    posterKey: null,
    startsAt: new Date("2030-12-31T20:00:00Z"),
    endsAt: new Date("2031-01-01T06:00:00Z"),
    registrationDeadline: null,
    capacity: 120,
    seatsOpen: 100,
    status: "OPEN",
    paymentMethods: { wero: { target: "06 00 00 00 00" }, cash: true, cheque: false },
    optionPaymentDeadline: new Date("2030-12-20T00:00:00Z"),
    reminderDaysBefore: 3,
    allowOnsitePayment: false,
    allowUnaccompaniedMinors: false,
    allowWalkIns: false,
    entryRefundable: true,
    entryRefundDeadline: null,
    questions: [],
    referencePrefix: "NT30",
    nextReference: 43,
    retentionDays: 90,
    capacityAlertLevel: 0,
    seatsAlertSent: false,
    closedAt: null,
    purgedAt: null,
    createdById: "org-1",
    church: { name: "ICC Rennes", slug: "icc-rennes" },
    tariffs: [
      { ageGroup: "ADULT", price: 10 },
      { ageGroup: "CHILD", price: 0 },
    ],
    options: [
      {
        id: "meal",
        label: "Repas",
        type: "CHOICE",
        scope: "PARTICIPANT",
        price: 8,
        stock: 50,
        active: true,
        pickup: true,
        refundable: true,
        refundDeadline: null,
        variants: [
          { id: "chicken", label: "Poulet", stock: 2, closed: false },
          { id: "veggie", label: "Végétarien", stock: null, closed: false },
        ],
      },
    ],
    ...overrides,
  };
}

/** Usage (places et stock) simulé pour `computeUsage`. */
export function mockUsage(seatsTaken: number, variants: Record<string, number> = {}) {
  prismaMock.ticketingParticipant.count.mockResolvedValue(seatsTaken);
  prismaMock.ticketingItem.groupBy.mockResolvedValue(
    Object.entries(variants).map(([variantId, qty]) => ({ optionId: "meal", variantId, _sum: { quantity: qty } }))
  );
  prismaMock.ticketingOnsiteSale.groupBy.mockResolvedValue([]);
}

/** Réservation chargée par `loadBooking`. */
export function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk-1",
    eventId: "ev-1",
    reference: "NT30-0042",
    contactName: "Awa",
    contactEmail: "awa@example.org",
    contactPhone: null,
    userId: null,
    guardianName: null,
    guardianPhone: null,
    answers: {},
    status: "ACTIVE",
    tokenSalt: "salt",
    event: eventRow(),
    participants: [
      { id: "p1", firstName: "Awa", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "DUE" },
      { id: "p2", firstName: "Léo", lastName: "K", ageGroup: "CHILD", status: "ACTIVE", entryPrice: 0, entryStatus: "FREE" },
    ],
    items: [
      {
        id: "i1",
        participantId: "p1",
        optionId: "meal",
        variantId: "chicken",
        quantity: 1,
        unitPrice: 8,
        status: "DUE",
        cancelledAt: null,
        option: { label: "Repas", pickup: true },
        variant: { label: "Poulet" },
      },
    ],
    payments: [],
    ...overrides,
  };
}

export const mailMocks = { sendEmail: vi.fn(async () => undefined) };
export const notificationMocks = { createNotification: vi.fn(async () => undefined), notifyUsers: vi.fn(async () => undefined) };

export async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}
