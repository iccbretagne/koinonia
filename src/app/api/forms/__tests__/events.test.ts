import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const has = vi.fn((_m: string) => true);
vi.mock("@/lib/registry", () => ({ registry: { has: (m: string) => has(m) } }));

const capability = vi.fn(async (..._a: unknown[]): Promise<"all" | "own" | null> => "all");
vi.mock("@/modules/forms/auth", () => ({ getFormsCapability: (...a: unknown[]) => capability(...a) }));
const hasChurchPermission = vi.fn(async (..._a: unknown[]) => false);
vi.mock("@/lib/auth", () => ({ hasChurchPermission: (...a: unknown[]) => hasChurchPermission(...a) }));

const { assertLinkableEvents: assertWith } = await import("../_events");
const SESSION = { user: { id: "u1" } } as never;
const assertLinkableEvents = (churchId: string, input: Parameters<typeof assertWith>[2]) => assertWith(SESSION, churchId, input);

/** Rattachement d'une participation à un événement (spec 079, lot 3, ADR-0027). */
describe("rattachement à un événement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capability.mockResolvedValue("all");
  });

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

  it("accès délégué : événement d'église seulement avec events:view, billetterie seulement avec un rôle d'événement", async () => {
    capability.mockResolvedValue("own");
    has.mockReturnValue(true);
    await expect(assertWith(SESSION, "c1", { eventId: "e1" })).rejects.toThrow("introuvable dans l'église");
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled();

    prismaMock.ticketingEvent.findFirst.mockResolvedValue(null);
    await expect(assertWith(SESSION, "c1", { ticketingEventId: "t1" })).rejects.toThrow("billetterie introuvable");
    expect(prismaMock.ticketingEvent.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", churchId: "c1", roles: { some: { userId: "u1" } } },
      select: { id: true },
    });

    hasChurchPermission.mockImplementation(async (_s: unknown, p: unknown) => p === "events:view");
    prismaMock.event.findFirst.mockResolvedValue({ id: "e1" });
    await expect(assertWith(SESSION, "c1", { eventId: "e1" })).resolves.toBeUndefined();
  });
});
