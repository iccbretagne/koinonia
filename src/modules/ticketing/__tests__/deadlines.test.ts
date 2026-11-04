import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { bookingRow, mailMocks, notificationMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => mailMocks);
vi.mock("@/lib/notifications", () => notificationMocks);

const { sendPaymentReminders, releaseUnpaidOptions, sendDayBeforeReminders, archiveFinishedEvents, purgeExpiredEvents } = await import("../services/deadlines");

const DAY = 86_400_000;

describe("échéances de la billetterie (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow());
    prismaMock.ticketingBooking.updateMany.mockResolvedValue({ count: 1 });
  });

  it("relance au délai réglé, une seule fois par réservation", async () => {
    const deadline = new Date("2030-12-20T00:00:00Z");
    prismaMock.ticketingEvent.findMany.mockResolvedValue([{ id: "ev-1", optionPaymentDeadline: deadline, reminderDaysBefore: 3 }]);
    prismaMock.ticketingBooking.findMany.mockResolvedValue([{ id: "bk-1" }]);
    // trop tôt : 4 jours avant
    expect(await sendPaymentReminders(new Date(deadline.getTime() - 4 * DAY))).toBe(0);
    expect(await sendPaymentReminders(new Date(deadline.getTime() - 2 * DAY))).toBe(1);
    expect(prismaMock.ticketingBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "bk-1", reminderSentAt: null } }));
    expect(mailMocks.sendEmail).toHaveBeenCalledTimes(1);
    // déjà relancée (prise atomique perdue) : pas de second email
    prismaMock.ticketingBooking.updateMany.mockResolvedValue({ count: 0 });
    await sendPaymentReminders(new Date(deadline.getTime() - DAY));
    expect(mailMocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("à la date limite, les options non réglées sont libérées sauf paiement sur place", async () => {
    prismaMock.ticketingItem.findMany.mockResolvedValue([{ id: "i1", bookingId: "bk-1" }]);
    prismaMock.ticketingItem.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2030-12-21");
    await releaseUnpaidOptions(now);
    const where = prismaMock.ticketingItem.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "DUE", cancelledAt: null, booking: { event: { allowOnsitePayment: false, optionPaymentDeadline: { lte: now } } } });
    expect(prismaMock.ticketingItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RELEASED", cancelledAt: now }) })
    );
    expect(mailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/Options libérées/) }));
  });

  it("rappel de la veille, une seule fois", async () => {
    prismaMock.ticketingBooking.findMany.mockResolvedValue([{ id: "bk-1" }]);
    expect(await sendDayBeforeReminders(new Date("2030-12-31T08:00:00Z"))).toBe(1);
    expect(prismaMock.ticketingBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "bk-1", dayBeforeSentAt: null } }));
    expect(mailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/demain/) }));
  });

  it("clôture 24 h après la fin", async () => {
    prismaMock.ticketingEvent.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2031-01-03");
    expect(await archiveFinishedEvents(now)).toBe(1);
    expect(prismaMock.ticketingEvent.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: "ARCHIVED", closedAt: now } });
  });

  it("purge des données nominatives après la durée de conservation, pas avant", async () => {
    const closedAt = new Date("2031-01-02");
    prismaMock.ticketingEvent.findMany.mockResolvedValue([{ id: "ev-1", closedAt, retentionDays: 90 }]);
    expect(await purgeExpiredEvents(new Date(closedAt.getTime() + 89 * DAY))).toBe(0);
    expect(await purgeExpiredEvents(new Date(closedAt.getTime() + 91 * DAY))).toBe(1);
    expect(prismaMock.ticketingBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactEmail: "", contactPhone: null, guardianName: null, answers: {} }) })
    );
    expect(prismaMock.ticketingParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { firstName: "Participant", lastName: "" } }));
    expect(prismaMock.ticketingEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { purgedAt: expect.any(Date) } }));
  });
});
