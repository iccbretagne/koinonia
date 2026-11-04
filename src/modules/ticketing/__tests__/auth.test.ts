import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const { getEventAccess, canDo, EVENT_ACTIONS, isTicketingVisible } = await import("../auth");

function session(role: Role, churchId = "church-1"): Session {
  return createSession({
    id: "user-1",
    churchRoles: [
      { id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "ICC", slug: "icc" }, departments: [] },
    ] as Session["user"]["churchRoles"],
  });
}

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 0;
  }
}

describe("accès à un événement de billetterie (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ id: "ev-1", churchId: "church-1", status: "OPEN" });
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([]);
  });

  it.each<Role>(["ADMIN", "SECRETARY"])("%s (ticketing:manage) est organisateur implicite", async (role) => {
    const access = await getEventAccess(session(role), "ev-1", prismaMock as never);
    expect(access.manager).toBe(true);
    expect(canDo(access, "configure")).toBe(true);
  });

  it("un STAR sans rôle n'a aucun droit sur l'événement", async () => {
    const access = await getEventAccess(session("STAR"), "ev-1", prismaMock as never);
    expect(access.roles.size).toBe(0);
    expect(canDo(access, "read")).toBe(false);
  });

  it("un STAR accueil contrôle mais ne paramètre ni n'encaisse les règlements", async () => {
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ role: "RECEPTION" }]);
    const access = await getEventAccess(session("STAR"), "ev-1", prismaMock as never);
    expect(canDo(access, "reception")).toBe(true);
    expect(canDo(access, "read")).toBe(true);
    expect(canDo(access, "configure")).toBe(false);
    expect(canDo(access, "payments")).toBe(false);
  });

  it("matrice des actions", () => {
    expect(EVENT_ACTIONS.configure).toEqual(["ORGANIZER"]);
    expect(EVENT_ACTIONS.payments).toEqual(["ORGANIZER", "TREASURER"]);
    expect(EVENT_ACTIONS.catering).toEqual(["ORGANIZER", "CATERING"]);
    expect(EVENT_ACTIONS.read).toContain("OBSERVER");
  });

  it("un événement d'une autre église répond 404, même pour un Admin", async () => {
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ id: "ev-2", churchId: "church-2", status: "OPEN" });
    expect(await status(getEventAccess(session("ADMIN"), "ev-2", prismaMock as never))).toBe(404);
  });

  it("un événement introuvable répond 404", async () => {
    prismaMock.ticketingEvent.findUnique.mockResolvedValue(null);
    expect(await status(getEventAccess(session("ADMIN"), "ev-x", prismaMock as never))).toBe(404);
  });

  it("les rôles s'arrêtent à la clôture (sauf ticketing:manage)", async () => {
    prismaMock.ticketingEvent.findUnique.mockResolvedValue({ id: "ev-1", churchId: "church-1", status: "ARCHIVED" });
    prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ role: "ORGANIZER" }]);
    expect((await getEventAccess(session("STAR"), "ev-1", prismaMock as never)).roles.size).toBe(0);
    expect(canDo(await getEventAccess(session("ADMIN"), "ev-1", prismaMock as never), "configure")).toBe(true);
  });

  it("lien de navigation : manager, ou rôle sur un événement actif", async () => {
    expect(await isTicketingVisible(session("SECRETARY"), "church-1", prismaMock as never)).toBe(true);
    prismaMock.ticketingEventRole.count.mockResolvedValue(0);
    expect(await isTicketingVisible(session("STAR"), "church-1", prismaMock as never)).toBe(false);
    prismaMock.ticketingEventRole.count.mockResolvedValue(1);
    expect(await isTicketingVisible(session("STAR"), "church-1", prismaMock as never)).toBe(true);
    expect(await isTicketingVisible(session("STAR"), null, prismaMock as never)).toBe(false);
  });
});
