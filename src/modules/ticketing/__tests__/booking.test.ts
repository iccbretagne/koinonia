import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { bookingRow, eventRow, mailMocks, mockUsage, notificationMocks, rejection } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => mailMocks);
vi.mock("@/lib/notifications", () => notificationMocks);
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { createBooking, patchBooking, recoverBooking, getTicket, bookingIdFromManageToken } = await import("../services/booking");
const { hashToken, deriveToken } = await import("../services/tokens");

const adult = { firstName: "Awa", lastName: "K", ageGroup: "ADULT" as const, options: [{ optionId: "meal", variantId: "chicken", quantity: 1 }] };
const child: { firstName: string; lastName: string; ageGroup: "ADULT" | "TEEN" | "CHILD"; options: never[] } = { firstName: "Léo", lastName: "K", ageGroup: "CHILD", options: [] };
const input = (participants = [adult, child]) => ({
  participants,
  bookingOptions: [],
  answers: {},
  contact: { name: "Awa", email: "awa@example.org", phone: null },
  guardian: null,
});

describe("réservations (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow());
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ seatsOpen: 100, seatsAlertSent: false, title: "Nuit" });
    prismaMock.ticketingBooking.create.mockResolvedValue({});
    prismaMock.ticketingParticipant.createMany.mockResolvedValue({ count: 2 });
    prismaMock.ticketingItem.createMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow());
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ userId: "cat-1" }]);
    mockUsage(10);
  });

  it("inscrit 2 personnes : prix figés, référence, jetons en empreinte, email au contact sans compte", async () => {
    const result = await createBooking("ev-1", input());
    expect(result.reference).toBe("NT30-0042");
    // verrou de l'événement par incrément du compteur de références
    expect(prismaMock.ticketingEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nextReference: { increment: 1 } } }));
    const booking = prismaMock.ticketingBooking.create.mock.calls[0][0].data;
    expect(booking.manageTokenHash).toBe(hashToken(result.manageToken));
    expect(booking.manageTokenHash).not.toBe(result.manageToken);
    expect(booking.userId).toBeNull();
    const participants = prismaMock.ticketingParticipant.createMany.mock.calls[0][0].data;
    expect(participants).toMatchObject([
      { firstName: "Awa", entryPrice: 10, entryStatus: "DUE" },
      { firstName: "Léo", entryPrice: 0, entryStatus: "FREE" },
    ]);
    const items = prismaMock.ticketingItem.createMany.mock.calls[0][0].data;
    expect(items).toMatchObject([{ optionId: "meal", variantId: "chicken", unitPrice: 8, status: "DUE", participantId: participants[0].id }]);
    expect(mailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "awa@example.org" }));
    expect(notificationMocks.createNotification).not.toHaveBeenCalled();
  });

  it("un email de compte lie la réservation et passe par la notification (préférence respectée)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-9" });
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow({ userId: "user-9" }));
    await createBooking("ev-1", input());
    expect(prismaMock.ticketingBooking.create.mock.calls[0][0].data.userId).toBe("user-9");
    expect(notificationMocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-9", domain: "ticketing" }), expect.anything());
    expect(mailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse au-delà des places ouvertes", async () => {
    mockUsage(99);
    expect((await rejection(createBooking("ev-1", input()))).statusCode).toBe(409);
    expect(prismaMock.ticketingBooking.create).not.toHaveBeenCalled();
  });

  it("refuse au-delà du stock d'un plat", async () => {
    mockUsage(10, { chicken: 2 });
    expect((await rejection(createBooking("ev-1", input()))).message).toMatch(/Poulet/);
  });

  it("refuse après la date limite, ou un événement non ouvert", async () => {
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ registrationDeadline: new Date("2020-01-01") }));
    expect((await rejection(createBooking("ev-1", input()))).message).toMatch(/date limite/);
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ status: "DRAFT" }));
    expect((await rejection(createBooking("ev-1", input()))).statusCode).toBe(409);
  });

  it("un mineur seul est refusé sans autorisation de l'organisateur", async () => {
    expect((await rejection(createBooking("ev-1", input([child])))).message).toMatch(/adulte/);
  });

  it("autorisé, un mineur seul exige un responsable légal, enregistré avec son accord", async () => {
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ allowUnaccompaniedMinors: true }));
    expect((await rejection(createBooking("ev-1", input([child])))).message).toMatch(/responsable légal/);
    await createBooking("ev-1", { ...input([child]), guardian: { name: "Maman", phone: "0600000000", consent: true } });
    const data = prismaMock.ticketingBooking.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ guardianName: "Maman", guardianPhone: "0600000000" });
    expect(data.guardianConsentAt).toBeInstanceOf(Date);
  });

  it("une tranche d'âge sans tarif est refusée", async () => {
    expect((await rejection(createBooking("ev-1", input([adult, { ...child, ageGroup: "TEEN" }])))).message).toMatch(/Tranche/);
  });

  describe("gestion par le titulaire", () => {
    it("annuler un participant payé remboursable : entrée à rembourser, options annulées, places rendues", async () => {
      prismaMock.ticketingBooking.findUnique.mockResolvedValue(
        bookingRow({
          participants: [
            { id: "p1", firstName: "Awa", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "PAID" },
            { id: "p3", firstName: "Ben", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "DUE" },
          ],
        })
      );
      const result = await patchBooking("bk-1", { action: "cancelParticipant", participantId: "p1" });
      expect(result.cancelled?.lastOne).toBe(false);
      expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ status: "CANCELLED", entryStatus: "REFUND_DUE" }) })
      );
      expect(prismaMock.ticketingItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "i1" }, data: expect.objectContaining({ status: "CANCELLED", cancelledAt: expect.any(Date) }) })
      );
      expect(mailMocks.sendEmail).toHaveBeenCalled();
    });

    it("entrée payée non remboursable : reste payée, l'email le signale", async () => {
      prismaMock.ticketingBooking.findUnique.mockResolvedValue(
        bookingRow({
          event: eventRow({ entryRefundable: false }),
          participants: [{ id: "p1", firstName: "Awa", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "PAID" }],
        })
      );
      const result = await patchBooking("bk-1", { action: "cancelBooking" });
      expect(result.cancelled).toMatchObject({ lastOne: true, keptPaid: true, pickup: true });
      expect(prismaMock.ticketingBooking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
      const mail = (mailMocks.sendEmail.mock.calls.at(-1) as unknown as [{ html: string }])[0];
      expect(mail.html).toMatch(/ne seront pas remboursés/);
      // la restauration est prévenue d'une option à retirer annulée
      expect(notificationMocks.notifyUsers).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ type: "TICKETING_PICKUP_CANCELLED" }));
    });

    it("annuler le seul adulte en laissant un mineur seul est refusé", async () => {
      expect((await rejection(patchBooking("bk-1", { action: "cancelParticipant", participantId: "p1" }))).message).toMatch(/adulte/);
    });

    it("changer de plat garde l'élément et son prix, l'étiquette est à refaire", async () => {
      await patchBooking("bk-1", {
        action: "updateOptions",
        participants: [{ participantId: "p1", options: [{ optionId: "meal", variantId: "veggie", quantity: 1 }] }, { participantId: "p2", options: [] }],
        bookingOptions: [],
      });
      expect(prismaMock.ticketingItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { variantId: "veggie", labelVersion: { increment: 1 } } });
      expect(prismaMock.ticketingItem.createMany).not.toHaveBeenCalled();
    });

    it("les options ne se modifient plus après la date limite", async () => {
      prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ optionPaymentDeadline: new Date("2020-01-01") }));
      const err = await rejection(
        patchBooking("bk-1", { action: "updateOptions", participants: [{ participantId: "p1", options: [] }], bookingOptions: [] })
      );
      expect(err.message).toMatch(/date limite/);
    });

    it("corriger un nom incrémente les étiquettes ; refusé une fois l'événement commencé", async () => {
      await patchBooking("bk-1", { action: "renameParticipant", participantId: "p1", firstName: "Aïcha", lastName: "K" });
      expect(prismaMock.ticketingItem.updateMany).toHaveBeenCalledWith({ where: { participantId: "p1" }, data: { labelVersion: { increment: 1 } } });
      prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow({ event: eventRow({ startsAt: new Date("2020-01-01") }) }));
      expect((await rejection(patchBooking("bk-1", { action: "renameParticipant", participantId: "p1", firstName: "X", lastName: "Y" }))).statusCode).toBe(409);
    });
  });

  it("« Retrouver ma réservation » n'envoie rien pour un email inconnu, et renvoie les liens sinon", async () => {
    prismaMock.ticketingBooking.findMany.mockResolvedValue([]);
    await recoverBooking("ev-1", "inconnu@example.org");
    expect(mailMocks.sendEmail).not.toHaveBeenCalled();
    prismaMock.ticketingBooking.findMany.mockResolvedValue([{ ...bookingRow(), event: { ...eventRow() } }]);
    await recoverBooking("ev-1", "awa@example.org");
    const mail = (mailMocks.sendEmail.mock.calls[0] as unknown as [{ to: string; html: string }])[0];
    expect(mail.to).toBe("awa@example.org");
    expect(mail.html).toContain(`/reservation/${deriveToken("manage", "bk-1", "salt")}`);
  });

  it("un jeton inconnu ou mal formé répond 404 sans détail", async () => {
    expect((await rejection(bookingIdFromManageToken("court"))).statusCode).toBe(404);
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(null);
    expect((await rejection(bookingIdFromManageToken("a".repeat(64)))).statusCode).toBe(404);
  });

  it("un billet ne montre que lui-même", async () => {
    prismaMock.ticketingParticipant.findUnique.mockResolvedValue({
      firstName: "Léo",
      lastName: "K",
      ageGroup: "CHILD",
      status: "ACTIVE",
      booking: { reference: "NT30-0042" },
      event: { ...eventRow() },
    });
    const ticket = await getTicket("b".repeat(64));
    expect(Object.keys(ticket).sort()).toEqual(["ageGroup", "event", "firstName", "lastName", "qr", "reference", "valid"]);
    expect(ticket.qr).toMatch(/\/billet\/b{64}$/);
  });
});
