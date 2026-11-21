/** Tests — activation des sites d'événement par l'église (spec 084) : coupée par défaut, journalisée. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { getSitesEnabled, setSitesEnabled } = await import("../services/site-settings");

beforeEach(() => vi.clearAllMocks());

describe("sites d'événement : activation par l'église", () => {
  it("coupée par défaut", async () => {
    prismaMock.ticketingSiteSettings.findUnique.mockResolvedValue(null);
    expect(await getSitesEnabled("c1")).toBe(false);
  });

  it("activer : enregistré pour l'église et journalisé", async () => {
    await setSitesEnabled("c1", true, "admin-1");
    expect(prismaMock.ticketingSiteSettings.upsert).toHaveBeenCalledWith({ where: { churchId: "c1" }, create: { churchId: "c1", enabled: true }, update: { enabled: true } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: "admin-1", churchId: "c1", entityType: "TicketingSiteSettings", details: { enabled: true } }));
  });
});
