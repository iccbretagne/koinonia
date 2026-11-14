import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const has = vi.fn((_m: string) => true);
vi.mock("@/lib/registry", () => ({ registry: { has: (m: string) => has(m) } }));

const { assertLinkableEvents } = await import("../_events");

/** Rattachement d'une participation à un événement (spec 079, lot 3, ADR-0027). */
describe("rattachement à un événement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("événement d'église ou de billetterie de l'église du formulaire seulement", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);
    await expect(assertLinkableEvents("c1", { eventId: "e-autre-eglise" })).rejects.toThrow("introuvable dans l'église");
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith({ where: { id: "e-autre-eglise", churchId: "c1" }, select: { id: true } });

    prismaMock.event.findFirst.mockResolvedValue({ id: "e1" });
    await expect(assertLinkableEvents("c1", { eventId: "e1" })).resolves.toBeUndefined();

    prismaMock.ticketingEvent.findFirst.mockResolvedValue(null);
    await expect(assertLinkableEvents("c1", { ticketingEventId: "t9" })).rejects.toThrow("billetterie introuvable");
  });

  it("billetterie désactivée : refusé ; aucun événement : rien à vérifier", async () => {
    has.mockReturnValue(false);
    await expect(assertLinkableEvents("c1", { ticketingEventId: "t1" })).rejects.toThrow("pas activée");
    await expect(assertLinkableEvents("c1", { eventId: null, ticketingEventId: null })).resolves.toBeUndefined();
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled();
  });
});
