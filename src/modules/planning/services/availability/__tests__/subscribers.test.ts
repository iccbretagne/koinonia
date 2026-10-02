import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { planningBus } = await import("@/modules/planning");
const { registerAvailabilitySubscribers } = await import("../subscribers");

const ctx = { tx: prismaMock as never, churchId: "church-1", userId: "user-1" };
const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);

describe("abonnés du bus — collecte de disponibilités", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    // `registered` est un drapeau de module : on réimporte pour réenregistrer proprement.
  });

  async function register() {
    vi.resetModules();
    const bus = (await import("@/modules/planning")).planningBus;
    bus.clear();
    (await import("../subscribers")).registerAvailabilitySubscribers();
    return bus;
  }

  it("événement déplacé : réponses et demandes supprimées, nouvelle demande EVENT_MOVED si la collecte est ouverte", async () => {
    const bus = await register();
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ id: "c-1", closesAt: future } as never);
    prismaMock.eventDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1", date: future } as never);
    prismaMock.availabilitySettings.findUnique.mockResolvedValue(null);

    await bus.emit("planning:event:rescheduled", ctx, {
      eventId: "evt-1",
      churchId: "church-1",
      previousDate: "2026-11-01T10:00:00.000Z",
      newDate: future.toISOString(),
    });

    expect(prismaMock.availabilityResponse.deleteMany).toHaveBeenCalledWith({ where: { eventId: "evt-1" } });
    expect(prismaMock.availabilityAsk.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_departmentId: { eventId: "evt-1", departmentId: "dept-1" } },
        create: expect.objectContaining({ reason: "EVENT_MOVED" }),
      })
    );
  });

  it("événement déplacé sans changement de date : rien", async () => {
    const bus = await register();
    await bus.emit("planning:event:rescheduled", ctx, {
      eventId: "evt-1",
      churchId: "church-1",
      previousDate: future.toISOString(),
      newDate: future.toISOString(),
    });
    expect(prismaMock.availabilityResponse.deleteMany).not.toHaveBeenCalled();
  });

  it("événement déplacé : pas de demande si la collecte du mois n'est pas ouverte", async () => {
    const bus = await register();
    prismaMock.availabilityCollection.findUnique.mockResolvedValue(null);

    await bus.emit("planning:event:rescheduled", ctx, {
      eventId: "evt-1",
      churchId: "church-1",
      previousDate: "2026-11-01T10:00:00.000Z",
      newDate: future.toISOString(),
    });

    expect(prismaMock.availabilityResponse.deleteMany).toHaveBeenCalled();
    expect(prismaMock.availabilityAsk.upsert).not.toHaveBeenCalled();
  });

  it("département ajouté après ouverture : demande EVENT_ADDED", async () => {
    const bus = await register();
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1", date: future } as never);
    prismaMock.availabilityCollection.findUnique.mockResolvedValue({ id: "c-1", closesAt: future } as never);
    prismaMock.availabilitySettings.findUnique.mockResolvedValue(null);

    await bus.emit("planning:event:departments:added", ctx, {
      eventId: "evt-1",
      churchId: "church-1",
      departmentIds: ["dept-2"],
    });

    expect(prismaMock.availabilityAsk.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ departmentId: "dept-2", reason: "EVENT_ADDED" }) })
    );
  });

  it("l'enregistrement est idempotent", () => {
    expect(() => {
      registerAvailabilitySubscribers();
      registerAvailabilitySubscribers();
    }).not.toThrow();
  });
});
