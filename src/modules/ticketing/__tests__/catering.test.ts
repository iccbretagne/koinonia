import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { bookingRow, mailMocks, notificationMocks, rejection } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => mailMocks);
vi.mock("@/lib/notifications", () => notificationMocks);
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { addVariant, updateVariant, deleteVariant } = await import("../services/menu");
const { deliverItem, recordOnsiteSale } = await import("../services/catering");
const { listLabels, markPrinted } = await import("../services/labels");
const { labelHash } = await import("../services/snapshot");
const { tokenPair, hashToken } = await import("../services/tokens");
const { parseScannedCode } = await import("../schemas");

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: "chicken",
  optionId: "meal",
  label: "Poulet",
  description: null,
  allergens: null,
  stock: 10,
  prepared: null,
  closed: false,
  option: { eventId: "ev-1", event: { churchId: "church-1" } },
  ...overrides,
});
const sum = (n: number) => ({ _sum: { quantity: n } });

describe("restauration (spec 074, lot 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
  });

  describe("menu composé par la restauration", () => {
    it("ajoute un plat à une option à choix, journalisé", async () => {
      prismaMock.ticketingOption.findUnique.mockResolvedValue({ id: "meal", eventId: "ev-1", type: "CHOICE", event: { churchId: "church-1" } });
      prismaMock.ticketingVariant.count.mockResolvedValue(2);
      prismaMock.ticketingVariant.create.mockResolvedValue({ id: "fish", label: "Poisson" });
      await addVariant("ev-1", "meal", "cat-1", { label: "Poisson", description: null, allergens: "poisson" });
      expect(prismaMock.ticketingVariant.create.mock.calls[0][0].data).toMatchObject({ optionId: "meal", label: "Poisson", allergens: "poisson", position: 2 });
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TicketingOption", entityId: "meal" }));
    });

    it("une option d'un autre événement est introuvable", async () => {
      prismaMock.ticketingOption.findUnique.mockResolvedValue({ id: "meal", eventId: "ev-2", type: "CHOICE", event: { churchId: "church-1" } });
      expect((await rejection(addVariant("ev-1", "meal", "cat-1", { label: "X", description: null, allergens: null }))).statusCode).toBe(404);
    });

    it("le stock ne descend pas sous le réservé ; avant/après journalisés", async () => {
      prismaMock.ticketingVariant.findUnique.mockResolvedValue(variant());
      prismaMock.ticketingItem.aggregate.mockResolvedValue(sum(6));
      prismaMock.ticketingOnsiteSale.aggregate.mockResolvedValue(sum(1));
      expect((await rejection(updateVariant("ev-1", "chicken", "cat-1", { stock: 5 }))).message).toMatch(/7 réservé/);
      await updateVariant("ev-1", "chicken", "cat-1", { stock: 8, allergens: "sésame" });
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ before: { stock: 10, allergens: null }, after: { stock: 8, allergens: "sésame" } }) }));
    });

    it("un plat réservé ne se supprime pas (il se ferme)", async () => {
      prismaMock.ticketingVariant.findUnique.mockResolvedValue(variant());
      prismaMock.ticketingItem.count.mockResolvedValue(3);
      prismaMock.ticketingOnsiteSale.count.mockResolvedValue(0);
      expect((await rejection(deleteVariant("ev-1", "chicken", "cat-1"))).statusCode).toBe(409);
      prismaMock.ticketingItem.count.mockResolvedValue(0);
      await deleteVariant("ev-1", "chicken", "cat-1");
      expect(prismaMock.ticketingVariant.delete).toHaveBeenCalled();
    });
  });

  describe("distribution", () => {
    const item = (overrides: Record<string, unknown> = {}) => ({
      id: "i1",
      bookingId: "bk-1",
      quantity: 2,
      deliveredQty: 0,
      status: "PAID",
      cancelledAt: null,
      option: { eventId: "ev-1", pickup: true },
      booking: { status: "ACTIVE" },
      ...overrides,
    });

    it("« Remis » sur un élément payé ; rejouer ne remet rien de plus", async () => {
      prismaMock.ticketingItem.findUnique.mockResolvedValue(item());
      expect(await deliverItem("ev-1", { id: "op-1", itemId: "i1", delivered: 2, scannedAt: new Date() }, "cat-1")).toEqual({ delivered: 2, changed: true });
      prismaMock.ticketingItem.findUnique.mockResolvedValue(item({ deliveredQty: 2 }));
      expect(await deliverItem("ev-1", { id: "op-1", itemId: "i1", delivered: 2, scannedAt: new Date() }, "cat-1")).toEqual({ delivered: 2, changed: false });
    });

    it("un élément à régler exige un encaissement, enregistré avant la remise", async () => {
      prismaMock.ticketingItem.findUnique.mockResolvedValue(item({ status: "DUE" }));
      expect((await rejection(deliverItem("ev-1", { id: "op-2", itemId: "i1", delivered: 1, scannedAt: new Date() }, "cat-1"))).message).toMatch(/encaissez/);
      prismaMock.ticketingPayment.findUnique.mockResolvedValue(null);
      prismaMock.ticketingBooking.findUnique.mockResolvedValue(bookingRow({ items: [{ ...bookingRow().items[0], quantity: 2, status: "DUE" }] }));
      prismaMock.ticketingPayment.create.mockResolvedValue({ id: "pay" });
      await deliverItem("ev-1", { id: "op-3", itemId: "i1", delivered: 2, method: "CASH", scannedAt: new Date() }, "cat-1");
      expect(prismaMock.ticketingPayment.create.mock.calls[0][0].data).toMatchObject({ kind: "RECEIPT", method: "CASH", amount: 16, opId: "op-3-pay" });
      expect(prismaMock.ticketingItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveredQty: 2 }) }));
    });

    it("un élément annulé ou libéré n'est pas remis", async () => {
      prismaMock.ticketingItem.findUnique.mockResolvedValue(item({ status: "RELEASED", cancelledAt: new Date() }));
      expect((await rejection(deliverItem("ev-1", { id: "op-4", itemId: "i1", delivered: 1, scannedAt: new Date() }, "cat-1"))).statusCode).toBe(409);
    });

    it("vente sur place : dans la limite du disponible (préparés − réservés − vendus), idempotente", async () => {
      prismaMock.ticketingOnsiteSale.findUnique.mockResolvedValue(null);
      prismaMock.ticketingOption.findUnique.mockResolvedValue({ id: "meal", eventId: "ev-1", pickup: true, price: 8, stock: null, variants: [{ id: "chicken", prepared: 20, stock: 30 }] });
      prismaMock.ticketingItem.aggregate.mockResolvedValue(sum(15));
      prismaMock.ticketingOnsiteSale.aggregate.mockResolvedValue(sum(3));
      expect((await rejection(recordOnsiteSale("ev-1", { id: "op-s1", optionId: "meal", variantId: "chicken", quantity: 3, method: "CASH", scannedAt: new Date() }, "cat-1"))).message).toMatch(/Plus que 2/);
      await recordOnsiteSale("ev-1", { id: "op-s2", optionId: "meal", variantId: "chicken", quantity: 2, method: "CASH", scannedAt: new Date() }, "cat-1");
      expect(prismaMock.ticketingOnsiteSale.create.mock.calls[0][0].data).toMatchObject({ id: "op-s2", quantity: 2, amount: 16 });
      prismaMock.ticketingOnsiteSale.findUnique.mockResolvedValue({ id: "op-s2" });
      expect(await recordOnsiteSale("ev-1", { id: "op-s2", optionId: "meal", variantId: "chicken", quantity: 2, method: "CASH", scannedAt: new Date() }, "cat-1")).toEqual({ duplicate: true });
    });
  });

  describe("étiquettes", () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: "i1",
      quantity: 1,
      status: "DUE",
      labelVersion: 3,
      labelPrintedVersion: 2,
      option: { label: "Repas" },
      variant: { label: "Poulet", allergens: "céleri" },
      participant: { firstName: "Awa", lastName: "K" },
      booking: { reference: "NT30-0042", contactName: "Awa", tokenSalt: "salt", answers: { q1: "arachide" } },
      ...overrides,
    });

    it("contenu : nom, plat, allergies, référence, « à régler », étiquette à refaire", async () => {
      prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ questions: [{ id: "q1", label: "Allergies", required: false }] });
      prismaMock.ticketingItem.findMany.mockResolvedValue([row(), row({ id: "i2", labelPrintedVersion: 3, status: "PAID", participant: null })]);
      const labels = await listLabels("ev-1", "all");
      expect(labels[0]).toMatchObject({ name: "Awa K", dish: "Poulet", allergies: "arachide", allergens: "céleri", reference: "NT30-0042", toPay: true, stale: true });
      expect(labels[1]).toMatchObject({ name: "Awa", toPay: false, stale: false, printed: true });
      const changed = await listLabels("ev-1", "changed");
      expect(changed.map((l) => l.itemId)).toEqual(["i1"]);
    });

    it("sélection par plat ou par réservation exige son filtre", async () => {
      expect((await rejection(listLabels("ev-1", "variant"))).statusCode).toBe(400);
      prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ questions: [] });
      prismaMock.ticketingItem.findMany.mockResolvedValue([]);
      await listLabels("ev-1", "variant", { variantId: "chicken" });
      expect(prismaMock.ticketingItem.findMany.mock.calls[0][0].where).toMatchObject({ variantId: "chicken", option: { eventId: "ev-1", namedPrep: true } });
    });

    it("marquer imprimées enregistre la version courante", async () => {
      prismaMock.ticketingItem.findMany.mockResolvedValue([{ id: "i1", labelVersion: 3 }]);
      prismaMock.ticketingItem.update.mockResolvedValue({});
      expect(await markPrinted("ev-1", ["i1"])).toEqual({ printed: 1 });
      expect(prismaMock.ticketingItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { labelPrintedVersion: 3, labelPrintedAt: expect.any(Date) } });
    });

    it("un code d'étiquette n'est jamais un billet : portée distincte, empreinte distincte", async () => {
      const { labelCode } = await import("../services/labels");
      const code = labelCode("i1", "salt");
      expect(parseScannedCode(code)?.scope).toBe("label");
      expect(hashToken(code.split(":")[1])).toBe(labelHash("i1", "salt"));
      expect(labelHash("i1", "salt")).not.toBe(tokenPair("ticket", "i1", "salt").hash);
    });
  });
});
