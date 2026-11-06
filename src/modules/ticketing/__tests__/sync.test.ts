import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { eventRow, mailMocks, notificationMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => mailMocks);
vi.mock("@/lib/notifications", () => notificationMocks);

const { applyOperations, correctClock } = await import("../services/sync");

const now = () => new Date();
const reception = { userId: "rec-1", roles: new Set(["RECEPTION" as const]) };
const pass = (id: string, participantId: string, direction: "IN" | "OUT" = "IN", scannedAt = now()) => ({
  type: "passage" as const,
  id,
  subject: "PARTICIPANT" as const,
  participantId,
  direction,
  scannedAt,
});

describe("synchronisation des écrans de terrain (spec 074, lot 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ capacity: 100, status: "OPEN" });
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ capacity: 100, capacityAlertLevel: 0, title: "Nuit", createdById: "org-1", status: "OPEN" });
    prismaMock.ticketingPassage.findMany.mockResolvedValue([]);
    prismaMock.ticketingParticipant.findMany.mockResolvedValue([
      { id: "p1", status: "ACTIVE", ageGroup: "ADULT" },
      { id: "p2", status: "CANCELLED", ageGroup: "ADULT" },
    ]);
    prismaMock.ticketingAssignment.findMany.mockResolvedValue([]);
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([]);
  });

  it("applique un passage, refuse un billet annulé", async () => {
    const r = await applyOperations("ev-1", { deviceId: "device-1", clientTime: now(), ops: [pass("op-aaaaaaa1", "p1"), pass("op-aaaaaaa2", "p2")] }, reception);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "rejected"]);
    expect(prismaMock.ticketingPassage.create).toHaveBeenCalledTimes(1);
    expect(r.counts.total).toBe(1);
  });

  it("idempotence : une opération déjà reçue n'est pas recomptée", async () => {
    prismaMock.ticketingPassage.findMany.mockImplementation(async (args: { where: { id?: unknown } }) =>
      args.where.id ? [{ id: "op-aaaaaaa1" }] : [{ id: "op-aaaaaaa1", subject: "PARTICIPANT", participantId: "p1", assignmentId: null, direction: "IN", delta: 1, scannedAt: now(), receivedAt: now() }]
    );
    const r = await applyOperations("ev-1", { deviceId: "device-1", clientTime: now(), ops: [pass("op-aaaaaaa1", "p1")] }, reception);
    expect(r.results[0].status).toBe("duplicate");
    expect(prismaMock.ticketingPassage.create).not.toHaveBeenCalled();
    expect(r.counts.total).toBe(1);
  });

  it("double entrée depuis un autre téléphone : gardée et marquée anomalie, organisation prévenue", async () => {
    prismaMock.ticketingPassage.findMany.mockImplementation(async (args: { where: { id?: unknown } }) =>
      args.where.id ? [] : [{ id: "other-1", subject: "PARTICIPANT", participantId: "p1", assignmentId: null, direction: "IN", delta: 1, scannedAt: new Date(Date.now() - 60_000), receivedAt: now() }]
    );
    await applyOperations("ev-1", { deviceId: "device-2", clientTime: now(), ops: [pass("op-bbbbbbb1", "p1")] }, reception);
    expect(prismaMock.ticketingPassage.create.mock.calls[0][0].data.anomaly).toBe(true);
    expect(notificationMocks.notifyUsers).toHaveBeenCalledWith(["org-1"], expect.objectContaining({ type: "TICKETING_ANOMALY" }));
  });

  it("la restauration ne peut pas enregistrer de passage", async () => {
    const r = await applyOperations("ev-1", { deviceId: "device-1", clientTime: now(), ops: [pass("op-ccccccc1", "p1")] }, { userId: "c", roles: new Set(["CATERING" as const]) });
    expect(r.results[0]).toMatchObject({ status: "rejected", reason: "Rôle insuffisant" });
  });

  it("ajout sur place hors ligne : réservation ONSITE, participants déduits de l'opération, entrés", async () => {
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(null);
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ allowWalkIns: true }));
    prismaMock.ticketingParticipant.count.mockResolvedValue(10);
    prismaMock.ticketingItem.groupBy.mockResolvedValue([]);
    prismaMock.ticketingOnsiteSale.groupBy.mockResolvedValue([]);
    const r = await applyOperations(
      "ev-1",
      {
        deviceId: "device-1",
        clientTime: now(),
        ops: [{ type: "walkin", id: "op-walk0001", participants: [{ firstName: "Zoé", lastName: "M", ageGroup: "ADULT" }], method: "CASH", enter: true, scannedAt: now() }],
      },
      reception
    );
    expect(r.results[0].status).toBe("applied");
    expect(prismaMock.ticketingBooking.create.mock.calls[0][0].data).toMatchObject({ id: "walkin-op-walk0001", source: "ONSITE", contactEmail: "" });
    expect(prismaMock.ticketingParticipant.createMany.mock.calls[0][0].data[0]).toMatchObject({ id: "op-walk0001-0", entryStatus: "PAID" });
    expect(prismaMock.ticketingPayment.create.mock.calls[0][0].data).toMatchObject({ kind: "RECEIPT", method: "CASH", amount: 10 });
    expect(prismaMock.ticketingPassage.createMany.mock.calls[0][0].data[0]).toMatchObject({ participantId: "op-walk0001-0", direction: "IN" });
  });

  it("ajout sur place refusé si l'organisateur ne l'autorise pas", async () => {
    prismaMock.ticketingBooking.findUnique.mockResolvedValue(null);
    prismaMock.ticketingEvent.update.mockResolvedValue(eventRow({ allowWalkIns: false }));
    const r = await applyOperations(
      "ev-1",
      { deviceId: "device-1", clientTime: now(), ops: [{ type: "walkin", id: "op-walk0002", participants: [{ firstName: "Zoé", lastName: "M", ageGroup: "ADULT" }], enter: true, scannedAt: now() }] },
      reception
    );
    expect(r.results[0].status).toBe("rejected");
  });

  it("correction de l'horloge de l'appareil", () => {
    const server = new Date("2030-12-31T23:00:00Z");
    const client = new Date("2030-12-31T22:50:00Z"); // téléphone en retard de 10 min
    expect(correctClock(new Date("2030-12-31T22:45:00Z"), client, server).toISOString()).toBe("2030-12-31T22:55:00.000Z");
    expect(correctClock(new Date("2031-01-01T10:00:00Z"), server, server)).toEqual(server);
  });
});
