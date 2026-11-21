/** Tests — rôle Communication (spec 084) : accès à `site`, refus partout ailleurs. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const requireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAuth: () => requireAuth() }));

const { requireEventAction, EVENT_ACTIONS } = await import("../auth");

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue(
    createSession({
      id: "com-1",
      churchRoles: [{ id: "r", churchId: "church-1", role: "STAR", ministryId: null, church: { id: "church-1", name: "ICC", slug: "icc" }, departments: [] }] as never,
    })
  );
  prismaMock.ticketingEvent.findUnique.mockResolvedValue({ id: "ev-1", churchId: "church-1", status: "OPEN" });
  prismaMock.ticketingEventRole.findMany.mockResolvedValue([{ role: "COMMUNICATION" }]);
});

describe("rôle d'événement Communication", () => {
  it("accède aux gestes `site`", async () => {
    await expect(requireEventAction("ev-1", "site")).resolves.toBeTruthy();
  });

  it.each(["read", "payments", "configure", "reception", "catering", "menu"] as const)("est refusé sur `%s`", async (action) => {
    await expect(requireEventAction("ev-1", action)).rejects.toThrow("FORBIDDEN");
  });

  it("n'est que dans `site` de la matrice", () => {
    const actions = Object.entries(EVENT_ACTIONS).filter(([, roles]) => (roles as readonly string[]).includes("COMMUNICATION"));
    expect(actions.map(([a]) => a)).toEqual(["site"]);
  });
});
