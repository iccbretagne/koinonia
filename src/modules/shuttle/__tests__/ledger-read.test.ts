import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { accountingMocks, entryRow, resetAccountingMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/modules/accounting", () => accountingMocks);

const { getLedger, reimbursementStatus } = await import("../services/ledger-read");

const viewer = { userId: "member-1", manager: false };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("registre de la navette — lecture (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAccountingMocks();
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-nav", ministryId: "min-1" }]);
    prismaMock.shuttleEntry.findMany.mockResolvedValue([
      entryRow({ id: "open", kind: "OPENING_BALANCE", category: null, amount: 120, date: d("2026-09-30"), createdAt: new Date("2026-09-30T08:00:00Z") }),
      entryRow({ id: "fund", kind: "FUNDING", category: null, amount: 200, date: d("2026-10-05"), createdAt: new Date("2026-10-05T08:00:00Z") }),
      entryRow({ id: "rent", category: "RENTAL", amount: -85, date: d("2026-10-11"), rental: { id: "r1", vendor: "Super U", vehicle: "Van", startDate: d("2026-10-11") } }),
      entryRow({ id: "dep", category: "DEPOSIT", amount: -300, date: d("2026-10-11"), rental: { id: "r1", vendor: "Super U", vehicle: "Van", startDate: d("2026-10-11") } }),
      entryRow({ id: "fuel", category: "FUEL", amount: -62, date: d("2026-10-12"), personalAdvance: true, reimbursementRequestId: "req-1" }),
      // Ticket oublié, antidaté : il se place à sa date.
      entryRow({ id: "late", category: "TOLL_PARKING", amount: -8, date: d("2026-10-06"), createdAt: new Date("2026-10-20T08:00:00Z") }),
    ]);
    accountingMocks.getRequestsProgress.mockResolvedValue([
      { id: "req-1", status: "APPROVED", amount: 62, rejectionReason: null, payments: [{ releasedAt: new Date(), releasedAmount: 30 }] },
    ]);
    accountingMocks.listReleasedBudgetAdvances.mockResolvedValue([
      { id: "pay-1", releasedAt: new Date("2026-10-20T00:00:00Z"), releasedAmount: 150, amount: 150, request: { id: "adv-1", label: "Avance navette" } },
    ]);
  });

  it("solde à date, soldes de période et solde courant, avance de budget comprise", async () => {
    const l = await getLedger("church-1", { from: "2026-10-01", to: "2026-10-31" }, viewer);
    expect(l.balanceToDate).toBe(120 + 200 - 85 - 300 - 62 - 8 + 150);
    expect(l.period.openingBalance).toBe(120);
    expect(l.period.inflows).toBe(350);
    expect(l.period.outflows).toBe(455);
    expect(l.period.closingBalance).toBe(15);
    expect(l.entries.map((e) => e.id)).toEqual(["fund", "late", "rent", "dep", "fuel", "advance-pay-1"]);
    expect(l.entries.find((e) => e.id === "late")!.runningBalance).toBe(312);
    const advance = l.entries.find((e) => e.id === "advance-pay-1")!;
    expect(advance).toMatchObject({ source: "accounting", kind: "BUDGET_ADVANCE", amount: 150, requestId: "adv-1" });
  });

  it("répartitions, cautions en cours et avances personnelles", async () => {
    const l = await getLedger("church-1", {}, viewer, new Date("2026-10-21T00:00:00Z"));
    expect(l.byCategory.find((c) => c.category === "RENTAL")!.total).toBe(85);
    expect(l.byRental).toEqual([expect.objectContaining({ id: "r1", cost: 85 })]);
    expect(l.outstandingDeposits).toEqual([expect.objectContaining({ id: "dep", amount: 300, ageDays: 10 })]);
    expect(l.personalAdvances.map((a) => a.id)).toEqual(["fuel"]);
    expect(l.personalAdvances[0].reimbursement).toMatchObject({ status: "PARTIALLY_PAID", paid: 30 });
  });

  it("une caution restituée ou non restituée n'est plus en cours", async () => {
    prismaMock.shuttleEntry.findMany.mockResolvedValue([
      entryRow({ id: "dep1", category: "DEPOSIT", amount: -300, returnedBy: { id: "ret", deletedAt: null } }),
      entryRow({ id: "dep2", category: "DEPOSIT", amount: -300, depositRetainedAt: new Date() }),
      entryRow({ id: "dep3", category: "DEPOSIT", amount: -300, returnedBy: { id: "ret2", deletedAt: new Date() } }),
    ]);
    const l = await getLedger("church-1", {}, viewer);
    expect(l.outstandingDeposits.map((x) => x.id)).toEqual(["dep3"]);
  });

  it("les notes de frais hors registre ne sont listées qu'à la compta", async () => {
    accountingMocks.listDepartmentExpenseReports.mockResolvedValue([
      { id: "req-1", label: "lié", amount: 62, status: "APPROVED", createdAt: new Date(), submittedBy: { id: "u", name: "Marc", email: null }, attachments: [] },
      { id: "req-9", label: "Péage", amount: 12, status: "SUBMITTED", createdAt: new Date(), submittedBy: { id: "u", name: "Marc", email: null }, attachments: [] },
    ]);
    expect((await getLedger("church-1", {}, viewer)).unlinkedExpenseReports).toEqual([]);
    const l = await getLedger("church-1", {}, { userId: "compta", manager: true });
    expect(l.unlinkedExpenseReports.map((r) => r.id)).toEqual(["req-9"]);
  });

  it("état d'un remboursement", () => {
    const req = (status: string, paid: number[]) => ({ status, amount: 50, payments: paid.map((p) => ({ releasedAt: new Date(), releasedAmount: p })) });
    expect(reimbursementStatus(req("SUBMITTED", [])).status).toBe("REQUESTED");
    expect(reimbursementStatus(req("APPROVED", [])).status).toBe("APPROVED");
    expect(reimbursementStatus(req("APPROVED", [20])).status).toBe("PARTIALLY_PAID");
    expect(reimbursementStatus(req("APPROVED", [20, 30])).status).toBe("PAID");
    expect(reimbursementStatus(req("REJECTED", [])).status).toBe("REJECTED");
  });
});
