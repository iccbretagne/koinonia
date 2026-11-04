import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { bookingRow, mailMocks, notificationMocks, rejection } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => mailMocks);
vi.mock("@/lib/notifications", () => notificationMocks);

const { declarePayment, confirmPayment, rejectPayment, recordReceipt, markRefunded } = await import("../services/payments");

const declaration = (overrides: Record<string, unknown> = {}) => ({
  id: "pay-1",
  eventId: "ev-1",
  bookingId: "bk-1",
  kind: "DECLARATION",
  status: "PENDING",
  amount: 18,
  chargeRefs: [
    { type: "entry", id: "p1" },
    { type: "item", id: "i1" },
  ],
  ...overrides,
});

describe("règlements (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow());
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ createdById: "org-1", status: "OPEN" });
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ userId: "tres-1" }]);
    prismaMock.ticketingPayment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "pay-new",
      ...data,
      booking: { reference: "NT30-0042", event: { title: "Nuit" } },
    }));
  });

  it("« J'ai payé » déclare les éléments dus et prévient le trésorier", async () => {
    await declarePayment("bk-1", "WERO");
    expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { entryStatus: "DECLARED" } });
    expect(prismaMock.ticketingItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "DECLARED", labelVersion: { increment: 1 } } });
    const data = prismaMock.ticketingPayment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: "DECLARATION", status: "PENDING", method: "WERO", amount: 18 });
    expect(data.chargeRefs).toEqual([
      { type: "entry", id: "p1" },
      { type: "item", id: "i1" },
    ]);
    expect(notificationMocks.notifyUsers).toHaveBeenCalledWith(["tres-1"], expect.objectContaining({ type: "TICKETING_PAYMENT_DECLARED" }));
  });

  it("rien à régler : 409", async () => {
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(
      bookingRow({ participants: [{ id: "p1", firstName: "A", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 0, entryStatus: "FREE" }], items: [] })
    );
    expect((await rejection(declarePayment("bk-1", "WERO"))).statusCode).toBe(409);
  });

  it("confirmer : déclaré → payé ; un élément annulé entre-temps → à rembourser ; le contact est prévenu", async () => {
    prismaMock.ticketingPayment.findUnique.mockResolvedValue(declaration());
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(
      bookingRow({
        participants: [{ id: "p1", firstName: "A", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "DECLARED" }],
        items: [{ ...bookingRow().items[0], status: "CANCELLED", cancelledAt: new Date() }],
      })
    );
    await confirmPayment("ev-1", "pay-1", "tres-1");
    expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { entryStatus: "PAID" } });
    expect(prismaMock.ticketingItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "REFUND_DUE", labelVersion: { increment: 1 } } });
    expect(prismaMock.ticketingPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED", confirmedById: "tres-1" }) }));
    expect(mailMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/Paiement confirmé/) }));
  });

  it("refuser avec motif : déclaré → à régler, motif envoyé", async () => {
    prismaMock.ticketingPayment.findUnique.mockResolvedValue(declaration());
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(
      bookingRow({
        participants: [{ id: "p1", firstName: "A", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", entryPrice: 10, entryStatus: "DECLARED" }],
        items: [{ ...bookingRow().items[0], status: "DECLARED" }],
      })
    );
    await rejectPayment("ev-1", "pay-1", "tres-1", "Aucun virement reçu");
    expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { entryStatus: "DUE" } });
    expect(prismaMock.ticketingPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", reason: "Aucun virement reçu" }) }));
    const mail = (mailMocks.sendEmail.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(mail.html).toContain("Aucun virement reçu");
  });

  it("une déclaration déjà traitée, ou d'un autre événement, est refusée", async () => {
    prismaMock.ticketingPayment.findUnique.mockResolvedValue(declaration({ status: "CONFIRMED" }));
    expect((await rejection(confirmPayment("ev-1", "pay-1", "u"))).statusCode).toBe(409);
    prismaMock.ticketingPayment.findUnique.mockResolvedValue(declaration({ eventId: "ev-2" }));
    expect((await rejection(confirmPayment("ev-1", "pay-1", "u"))).statusCode).toBe(404);
  });

  it("encaissement partiel : seuls les éléments cochés passent à payé", async () => {
    await recordReceipt("ev-1", "bk-1", { method: "CASH", charges: [{ type: "entry", id: "p1" }] }, "acc-1");
    expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { entryStatus: "PAID" } });
    expect(prismaMock.ticketingItem.update).not.toHaveBeenCalled();
    expect(prismaMock.ticketingPayment.create.mock.calls[0][0].data).toMatchObject({ kind: "RECEIPT", status: "CONFIRMED", amount: 10, method: "CASH" });
  });

  it("l'accueil n'encaisse que les entrées, la restauration que les options à retirer", async () => {
    expect((await rejection(recordReceipt("ev-1", "bk-1", { method: "CASH", charges: [{ type: "item", id: "i1" }] }, "u", "entry"))).message).toBe("FORBIDDEN");
    expect((await rejection(recordReceipt("ev-1", "bk-1", { method: "CASH", charges: [{ type: "entry", id: "p1" }] }, "u", "pickup"))).message).toBe("FORBIDDEN");
    await recordReceipt("ev-1", "bk-1", { method: "CASH", charges: [{ type: "item", id: "i1" }] }, "u", "pickup");
    expect(prismaMock.ticketingItem.update).toHaveBeenCalled();
  });

  it("un encaissement hors ligne rejoué (même opId) n'est pas compté deux fois", async () => {
    prismaMock.ticketingPayment.findUnique.mockResolvedValue({ id: "pay-old", opId: "op-12345678" });
    const result = await recordReceipt("ev-1", "bk-1", { method: "CASH", charges: [{ type: "entry", id: "p1" }], opId: "op-12345678" }, "u");
    expect(result).toMatchObject({ id: "pay-old" });
    expect(prismaMock.ticketingPayment.create).not.toHaveBeenCalled();
  });

  it("rembourser : seuls les éléments « à rembourser » passent à remboursé", async () => {
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(
      bookingRow({ participants: [{ id: "p1", firstName: "A", lastName: "K", ageGroup: "ADULT", status: "CANCELLED", entryPrice: 10, entryStatus: "REFUND_DUE" }] })
    );
    await markRefunded("ev-1", "bk-1", { method: "TRANSFER", charges: [{ type: "entry", id: "p1" }, { type: "item", id: "i1" }] }, "tres-1");
    expect(prismaMock.ticketingParticipant.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { entryStatus: "REFUNDED" } });
    expect(prismaMock.ticketingItem.update).not.toHaveBeenCalled();
    expect(prismaMock.ticketingPayment.create.mock.calls[0][0].data).toMatchObject({ kind: "REFUND", amount: 10 });
  });
});
