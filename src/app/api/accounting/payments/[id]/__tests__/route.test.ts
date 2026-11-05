import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

/** Paiement « payé depuis » un compte de trésorerie (spec 076, ADR-0027). */
const session = createSession({ id: "compta-1" });
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => session), getCurrentChurchId: vi.fn(async () => "church-1") }));
let treasuryEnabled = true;
vi.mock("@/lib/registry", () => ({
  rolePermissions: { ADMIN: ["accounting:manage"] },
  registry: { has: (m: string) => m !== "treasury" || treasuryEnabled },
}));
vi.mock("@/lib/email", () => ({ buildAccountingPaymentEmail: vi.fn(() => ({ subject: "", html: "" })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
const getActiveTreasuryAccount = vi.fn();
const assertTreasuryDateOpen = vi.fn();
vi.mock("@/modules/treasury", () => ({
  getActiveTreasuryAccount: (...a: unknown[]) => getActiveTreasuryAccount(...a),
  assertTreasuryDateOpen: (...a: unknown[]) => assertTreasuryDateOpen(...a),
}));

const { PATCH } = await import("../route");
const { ApiError } = await import("@/lib/api-utils");

const req = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/accounting/payments/p1", {
    method: "PATCH",
    body: JSON.stringify({ releasedAt: "2026-11-02T10:00:00.000Z", releasedAmount: 50, ...body }),
    headers: { "content-type": "application/json" },
  });
const params = { params: Promise.resolve({ id: "p1" }) };

describe("PATCH /api/accounting/payments/[id] — compte de trésorerie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    treasuryEnabled = true;
    prismaMock.financialPayment.findUnique.mockResolvedValue({
      id: "p1",
      requestId: "r1",
      amount: 50,
      releasedAt: null,
      note: null,
      scheduledDate: new Date(),
      request: { churchId: "church-1", label: "Câbles", submittedById: "u2", amount: 50 },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.financialPayment.update.mockResolvedValue({ id: "p1" });
    prismaMock.financialPayment.count.mockResolvedValue(1);
    prismaMock.user.findUnique.mockResolvedValue({ name: "U", email: "u@example.invalid" });
    prismaMock.church.findUnique.mockResolvedValue({ name: "Église" });
  });

  it("sans compte : payé depuis le compte commun, rien n'est repris", async () => {
    expect((await PATCH(req({}), params)).status).toBe(200);
    expect(prismaMock.financialPayment.update.mock.calls[0][0].data.treasuryAccountId).toBeNull();
    expect(getActiveTreasuryAccount).not.toHaveBeenCalled();
  });

  it("avec une caisse active et un mois ouvert : le compte est posé sur la tranche", async () => {
    expect((await PATCH(req({ treasuryAccountId: "caisse" }), params)).status).toBe(200);
    expect(getActiveTreasuryAccount).toHaveBeenCalledWith("church-1", "caisse");
    expect(assertTreasuryDateOpen).toHaveBeenCalledWith("church-1", new Date("2026-11-02T10:00:00.000Z"));
    expect(prismaMock.financialPayment.update.mock.calls[0][0].data.treasuryAccountId).toBe("caisse");
  });

  it("mois clôturé ou compte archivé dans la trésorerie : 400, le paiement n'est pas confirmé", async () => {
    assertTreasuryDateOpen.mockRejectedValueOnce(new ApiError(400, "Novembre 2026 est clôturé"));
    expect((await PATCH(req({ treasuryAccountId: "caisse" }), params)).status).toBe(400);
    getActiveTreasuryAccount.mockRejectedValueOnce(new ApiError(400, "Ce compte de trésorerie est archivé"));
    expect((await PATCH(req({ treasuryAccountId: "caisse" }), params)).status).toBe(400);
    expect(prismaMock.financialPayment.update).not.toHaveBeenCalled();
  });

  it("trésorerie désactivée : le champ est refusé", async () => {
    treasuryEnabled = false;
    expect((await PATCH(req({ treasuryAccountId: "caisse" }), params)).status).toBe(400);
    expect(prismaMock.financialPayment.update).not.toHaveBeenCalled();
  });
});
