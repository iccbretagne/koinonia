/**
 * Tests — contexte d'audit (spec 083) : `withAuditContext` ajoute ses détails à toute entrée
 * écrite pendant l'appel, et seulement pendant l'appel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { logAudit, withAuditContext } = await import("../audit");
const { maskIban } = await import("../iban");
const details = () => prismaMock.auditLog.create.mock.calls.at(-1)?.[0].data.details;

beforeEach(() => vi.clearAllMocks());

describe("withAuditContext", () => {
  it("fusionne { via: \"mcp\" } dans les détails, y compris sans détails", async () => {
    await withAuditContext({ via: "mcp" }, async () => {
      await logAudit({ userId: "u1", action: "UPDATE", entityType: "TicketingEvent", entityId: "e1", details: { fields: ["title"] } });
      expect(details()).toEqual({ fields: ["title"], via: "mcp" });
      await logAudit({ userId: "u1", action: "DELETE", entityType: "TicketingPost", entityId: "p1" });
      expect(details()).toEqual({ via: "mcp" });
    });
  });

  it("hors de l'enveloppe : détails inchangés", async () => {
    await withAuditContext({ via: "mcp" }, async () => undefined);
    await logAudit({ userId: "u1", action: "UPDATE", entityType: "X", entityId: "x", details: { a: 1 } });
    expect(details()).toEqual({ a: 1 });
  });
});

describe("maskIban", () => {
  it("pays, clé et 4 derniers caractères seulement", () => {
    expect(maskIban("FR76 3000 6000 0112 3456 7890 189")).toBe("FR76 •••• 0189");
    expect(maskIban("x")).toBe("••••");
  });
});
