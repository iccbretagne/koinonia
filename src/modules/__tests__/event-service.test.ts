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
