import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { notificationMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => notificationMocks);

const { computePresence, capacityLevel, isAnomalous, insideState, notifyCapacity } = await import("../services/presence");

const at = (min: number) => new Date(Date.UTC(2030, 11, 31, 20, min));
const p = (id: string, who: string, direction: "IN" | "OUT", min: number, subject: "PARTICIPANT" | "STAFF" | "MANUAL" = "PARTICIPANT") => ({
  id,
  subject,
  participantId: subject === "PARTICIPANT" ? who : null,
  assignmentId: subject === "STAFF" ? who : null,
  direction,
  delta: 1,
  scannedAt: at(min),
});
const ages = new Map([
  ["a", "ADULT" as const],
  ["k", "CHILD" as const],
]);

describe("présences (spec 074, lot 2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("catégories : participants (dont mineurs), équipe à part, comptage manuel", () => {
    const counts = computePresence(
      [p("1", "a", "IN", 1), p("2", "k", "IN", 2), p("3", "s1", "IN", 3, "STAFF"), p("4", "", "IN", 4, "MANUAL"), p("5", "", "IN", 5, "MANUAL"), p("6", "", "OUT", 6, "MANUAL")],
      ages
    );
    expect(counts).toEqual({ participants: 2, minors: 1, staff: 1, manual: 1, total: 4 });
  });

  it("entrées décalées et désordre de réception : le dernier geste dans le temps compte", () => {
    // reçus dans le désordre : la sortie (min 30) arrive avant l'entrée (min 10)
    const counts = computePresence([p("2", "a", "OUT", 30), p("1", "a", "IN", 10), p("3", "k", "IN", 15)], ages);
    expect(counts.total).toBe(1);
    expect([...insideState([p("2", "a", "OUT", 30), p("1", "a", "IN", 10)]).inside]).toEqual([]);
  });

  it("double entrée : anomalie signalée, pas de double comptage", () => {
    const history = [p("1", "a", "IN", 1)];
    expect(isAnomalous(history, p("2", "a", "IN", 5))).toBe(true);
    expect(isAnomalous(history, p("3", "a", "OUT", 5))).toBe(false);
    expect(computePresence([...history, p("2", "a", "IN", 5)], ages).participants).toBe(1);
  });

  it("seuils de jauge", () => {
    expect(capacityLevel(89, 100)).toBe(0);
    expect(capacityLevel(90, 100)).toBe(90);
    expect(capacityLevel(100, 100)).toBe(100);
  });

  it("90 % puis 100 % notifiés une seule fois chacun", async () => {
    prismaMock.ticketingEvent.findUnique.mockResolvedValueOnce({ capacity: 100, capacityAlertLevel: 0, title: "Nuit" });
    prismaMock.ticketingEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.ticketingEvent.findUnique.mockResolvedValueOnce({ createdById: "org-1", status: "OPEN" });
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ userId: "acc-1" }]);
    await notifyCapacity("ev-1", 92);
    expect(prismaMock.ticketingEvent.updateMany).toHaveBeenCalledWith({ where: { id: "ev-1", capacityAlertLevel: { lt: 90 } }, data: { capacityAlertLevel: 90 } });
    expect(notificationMocks.notifyUsers).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ type: "TICKETING_CAPACITY" }));
    vi.clearAllMocks();
    prismaMock.ticketingEvent.findUnique.mockResolvedValueOnce({ capacity: 100, capacityAlertLevel: 90, title: "Nuit" });
    await notifyCapacity("ev-1", 95);
    expect(prismaMock.ticketingEvent.updateMany).not.toHaveBeenCalled();
    expect(notificationMocks.notifyUsers).not.toHaveBeenCalled();
  });
});
