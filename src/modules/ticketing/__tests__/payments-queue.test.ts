/** File « Règlements à confirmer » de l'Accueil (spec 092) : geste `payments`, événements non clôturés. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const { countPendingDeclarations, paymentsEventsWhere } = await import("../services/payments-queue");

function session(role: Role, churchId = "church-1"): Session {
  return createSession({
    id: "user-1",
    churchRoles: [
      { id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "ICC", slug: "icc" }, departments: [] },
    ] as Session["user"]["churchRoles"],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticketingPayment.groupBy.mockResolvedValue([
    { eventId: "ev-1", _count: { _all: 2 } },
    { eventId: "ev-2", _count: { _all: 1 } },
  ]);
});

describe("paymentsEventsWhere", () => {
  it("ticketing:manage : tous les événements non archivés de l'église", async () => {
    expect(await paymentsEventsWhere(session("ADMIN"), "church-1")).toEqual({ churchId: "church-1", status: { not: "ARCHIVED" } });
  });

  it("sans ticketing:manage : seulement les événements où l'on est Organisateur ou Trésorier", async () => {
    const where = await paymentsEventsWhere(session("STAR"), "church-1");
    expect(where).toEqual({
      churchId: "church-1",
      status: { not: "ARCHIVED" },
      roles: { some: { userId: "user-1", role: { in: ["ORGANIZER", "TREASURER"] } } },
    });
  });
});

describe("countPendingDeclarations", () => {
  it("compte les déclarations PENDING en une requête groupée, par événement", async () => {
    prismaMock.ticketingEvent.count.mockResolvedValue(2);
    const res = await countPendingDeclarations(session("ADMIN"), "church-1");
    expect(res).toEqual({ count: 3, perEvent: [{ eventId: "ev-1", count: 2 }, { eventId: "ev-2", count: 1 }] });
    expect(prismaMock.ticketingPayment.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.ticketingPayment.groupBy.mock.calls[0][0].where).toEqual({
      kind: "DECLARATION",
      status: "PENDING",
      event: { churchId: "church-1", status: { not: "ARCHIVED" } },
    });
  });

  it("aucun événement avec le geste payments : aucune file (null, pas 0)", async () => {
    prismaMock.ticketingEvent.count.mockResolvedValue(0);
    prismaMock.ticketingPayment.groupBy.mockResolvedValue([]);
    await expect(countPendingDeclarations(session("STAR"), "church-1")).resolves.toBeNull();
  });

  it("autre église : aucune requête, aucune file", async () => {
    await expect(countPendingDeclarations(session("ADMIN", "church-2"), "church-1")).resolves.toBeNull();
    expect(prismaMock.ticketingPayment.groupBy).not.toHaveBeenCalled();
  });
});
