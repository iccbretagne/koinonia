import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

/** Compte d'une tranche déjà remise (spec 089). */
let session = createSession({ id: "compta-1", churchRoles: [{ churchId: "church-1", role: "ADMIN" }] } as never);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => session), getCurrentChurchId: vi.fn(async () => "church-1") }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/registry", () => ({
  rolePermissions: { ADMIN: ["accounting:manage"], STAR: [] },
  registry: { has: () => true },
}));
const getActiveTreasuryAccount = vi.fn();
const assertTreasuryDateOpen = vi.fn();
vi.mock("@/modules/treasury", () => ({
  getActiveTreasuryAccount: (...a: unknown[]) => getActiveTreasuryAccount(...a),
  assertTreasuryDateOpen: (...a: unknown[]) => assertTreasuryDateOpen(...a),
}));

const { PUT } = await import("./route");
const { ApiError } = await import("@/lib/api-utils");

const req = (treasuryAccountId: string | null) =>
  new Request("http://localhost/api/accounting/payments/p1/treasury-account", {
    method: "PUT",
    body: JSON.stringify({ treasuryAccountId }),
    headers: { "content-type": "application/json" },
  });
const params = { params: Promise.resolve({ id: "p1" }) };
const released = new Date("2026-11-22T10:00:00Z");

describe("PUT /api/accounting/payments/[id]/treasury-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session = createSession({ id: "compta-1", churchRoles: [{ churchId: "church-1", role: "ADMIN" }] } as never);
    prismaMock.financialPayment.findUnique.mockResolvedValue({
      id: "p1", releasedAt: released, treasuryAccountId: null, requestId: "r1", request: { churchId: "church-1" },
    });
    prismaMock.financialPayment.update.mockImplementation(async (a: { data: { treasuryAccountId: string | null } }) => ({ id: "p1", ...a.data }));
  });

  it("rattache une tranche remise à une caisse active, mois ouvert", async () => {
    const res = await PUT(req("caisse-1"), params);
    expect(res.status).toBe(200);
    expect(getActiveTreasuryAccount).toHaveBeenCalledWith("church-1", "caisse-1");
    expect(assertTreasuryDateOpen).toHaveBeenCalledWith("church-1", released);
    expect(prismaMock.financialPayment.update.mock.calls[0][0].data).toEqual({ treasuryAccountId: "caisse-1" });
  });

  it("remet sur le compte commun : le mois doit être ouvert pour l'ancienne caisse", async () => {
    prismaMock.financialPayment.findUnique.mockResolvedValue({
      id: "p1", releasedAt: released, treasuryAccountId: "caisse-1", requestId: "r1", request: { churchId: "church-1" },
    });
    assertTreasuryDateOpen.mockRejectedValueOnce(new ApiError(400, "Novembre 2026 est clôturé"));
    expect((await PUT(req(null), params)).status).toBe(400);
    expect(prismaMock.financialPayment.update).not.toHaveBeenCalled();
  });

  it("refuse une tranche non remise (400), d'une autre église (404), ou sans accounting:manage (403)", async () => {
    prismaMock.financialPayment.findUnique.mockResolvedValueOnce({
      id: "p1", releasedAt: null, treasuryAccountId: null, requestId: "r1", request: { churchId: "church-1" },
    });
    expect((await PUT(req("caisse-1"), params)).status).toBe(400);
    prismaMock.financialPayment.findUnique.mockResolvedValueOnce({
      id: "p1", releasedAt: released, treasuryAccountId: null, requestId: "r1", request: { churchId: "church-2" },
    });
    expect((await PUT(req("caisse-1"), params)).status).toBe(404);
    session = createSession({ id: "star-1", churchRoles: [{ churchId: "church-1", role: "STAR" }] } as never);
    expect((await PUT(req("caisse-1"), params)).status).toBe(403);
    expect(prismaMock.financialPayment.update).not.toHaveBeenCalled();
  });
});
