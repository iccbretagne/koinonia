import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Importer après le mock prisma
const { deleteEvents } = await import("@/modules/planning");
const { planningBus } = await import("@/modules/planning");

type TxClient = Parameters<typeof deleteEvents>[0]["tx"];
const tx = prismaMock as unknown as TxClient;

function makeCtx(churchId = "church-1", userId = "user-1") {
  return { tx, churchId, userId };
}

describe("deleteEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.eventDepartment.findMany.mockResolvedValue([]);
    prismaMock.event.findMany.mockResolvedValue([]); // audience des notifications (spec 059)
  });

  it("est un no-op si la liste est vide", async () => {
    await deleteEvents(makeCtx(), []);
    expect(prismaMock.event.deleteMany).not.toHaveBeenCalled();
  });

  it("émet planning:event:cancelled pour chaque eventId", async () => {
    const handler = vi.fn();
    planningBus.on("planning:event:cancelled", handler);

    await deleteEvents(makeCtx(), ["evt-1", "evt-2"]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][1]).toMatchObject({ eventId: "evt-1" });
    expect(handler.mock.calls[1][1]).toMatchObject({ eventId: "evt-2" });
  });

  it("supprime toutes les tables FK avant l'event", async () => {
    prismaMock.eventDepartment.findMany.mockResolvedValue([
      { id: "ed-1" },
    ] as never);

    await deleteEvents(makeCtx(), ["evt-1"]);

    // Ordre : planning → eventDepartment → taskAssignment → eventReport → announcementEvent → event
    const calls = Object.entries(prismaMock).reduce<string[]>((acc, [model, mock]) => {
      const m = mock as Record<string, { mock?: { calls: unknown[][] } }>;
      if (m.deleteMany?.mock?.calls?.length) acc.push(model);
      return acc;
    }, []);

    expect(calls).toContain("planning");
    expect(calls).toContain("eventDepartment");
    expect(calls).toContain("taskAssignment");
    expect(calls).toContain("eventReport");
    expect(calls).toContain("announcementEvent");
    expect(calls).toContain("event");
  });

  it("supprime event.deleteMany avec tous les ids", async () => {
    await deleteEvents(makeCtx(), ["evt-1", "evt-2", "evt-3"]);

    expect(prismaMock.event.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["evt-1", "evt-2", "evt-3"] } },
    });
  });

  it("utilise cancelledById = 'system' si userId absent", async () => {
    const handler = vi.fn();
    planningBus.on("planning:event:cancelled", handler);

    await deleteEvents({ tx, churchId: "church-1" }, ["evt-1"]);

    expect(handler.mock.calls[0][1]).toMatchObject({ cancelledById: "system" });
  });
});

describe("deleteEvents — notifications d'annulation (spec 059)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.eventDepartment.findMany.mockResolvedValue([{ id: "ed-1" }] as never);
    prismaMock.event.findMany.mockResolvedValue([{ id: "evt-1", title: "Culte", date: new Date("2099-01-04T09:00:00Z") }] as never);
    prismaMock.planning.findMany.mockResolvedValue([
      {
        eventDepartment: { eventId: "evt-1", departmentId: "dept-1", department: { name: "Louange", ministryId: "min-1" } },
        member: { userLinks: [{ userId: "u-star" }] },
      },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  });

  it("lit les planifiés avant de purger les plannings et rend les notifications", async () => {
    const notices = await deleteEvents(makeCtx(), ["evt-1"]);

    const readOrder = prismaMock.planning.findMany.mock.invocationCallOrder[0];
    const purgeOrder = prismaMock.planning.deleteMany.mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(purgeOrder);
    expect(notices.items).toEqual([expect.objectContaining({ userId: "u-star", type: "EVENT_CANCELLED" })]);
  });

  it("n'inclut pas l'auteur de la suppression", async () => {
    const notices = await deleteEvents(makeCtx("church-1", "u-star"), ["evt-1"]);
    expect(notices.items).toEqual([]);
  });
});
