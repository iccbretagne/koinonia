import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createAuthScopeMocks } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

function get(query: string) {
  return GET(new Request(`http://localhost/api/accounting/stats${query}`));
}

function request(status: string, type: string, amount: number, dept: { id: string; name: string } | null, payments: object[] = []) {
  return { status, type, amount, departmentId: dept?.id ?? null, department: dept, payments };
}

const louange = { id: "dept-1", name: "Louange" };

describe("GET /api/accounting/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0)); // 15 mai 2026, heure locale
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    prismaMock.financialRequest.findMany.mockResolvedValue([]);
    prismaMock.financialPayment.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("exige churchId et une période valide", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?churchId=church-1&period=week")).status).toBe(400);
  });

  it.each([
    ["month", new Date(2026, 4, 1)],
    ["quarter", new Date(2026, 3, 1)],
    ["year", new Date(2026, 0, 1)],
  ])("borne la période %s", async (period, from) => {
    const res = await get(`?churchId=church-1&period=${period}`);
    const body = await res.json();
    expect(body.dateRange.from).toBe(from.toISOString());
    expect(body.dateRange.to).toBe(new Date(2026, 4, 15, 23, 59, 59, 999).toISOString());
  });

  it("agrège la vue d'ensemble, les statuts, les types et les départements", async () => {
    prismaMock.financialRequest.findMany.mockResolvedValueOnce([
      request("APPROVED", "PURCHASE", 100, louange, [
        { amount: 60, releasedAt: new Date(), releasedAmount: 50 },
        { amount: 40, releasedAt: null, releasedAmount: null },
      ]),
      request("SUBMITTED", "PURCHASE", 30, null),
      request("PROCESSING", "REFUND", 20, louange),
      request("REJECTED", "REFUND", 10, null),
      request("CANCELLED", "PURCHASE", 5, null),
    ]);

    const body = await (await get("?churchId=church-1")).json();
    expect(body.period).toBe("year");
    expect(body.overview).toEqual({
      totalRequests: 5,
      totalAmount: 150,
      approvedAmount: 100,
      releasedAmount: 50,
      pendingAmount: 50,
      rejectedCount: 1,
      cancelledCount: 1,
      approvalRate: 25,
    });
    expect(body.byStatus).toEqual([
      { status: "APPROVED", count: 1, amount: 100 },
      { status: "SUBMITTED", count: 1, amount: 30 },
      { status: "PROCESSING", count: 1, amount: 20 },
      { status: "REJECTED", count: 1, amount: 10 },
      { status: "CANCELLED", count: 1, amount: 5 },
    ]);
    expect(body.byType).toEqual([
      { type: "PURCHASE", count: 3, amount: 135 },
      { type: "REFUND", count: 2, amount: 30 },
    ]);
    expect(body.byDepartment).toEqual([
      { name: "Louange", count: 2, amount: 120, released: 50 },
      { name: "Personnel", count: 3, amount: 45, released: 0 },
    ]);
  });

  it("n'a pas de taux d'approbation sans demande éligible", async () => {
    prismaMock.financialRequest.findMany.mockResolvedValueOnce([request("CANCELLED", "PURCHASE", 5, null)]);
    const body = await (await get("?churchId=church-1")).json();
    expect(body.overview.approvalRate).toBeNull();
  });

  it("trace la tendance des 12 derniers mois et liste les paiements en retard", async () => {
    prismaMock.financialRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { createdAt: new Date(2026, 4, 2), amount: 70 },
        { createdAt: new Date(2025, 5, 10), amount: 30 },
        { createdAt: new Date(2025, 4, 30), amount: 999 }, // hors fenêtre
      ]);
    prismaMock.financialPayment.findMany
      .mockResolvedValueOnce([
        { releasedAt: new Date(2026, 3, 3), releasedAmount: null, amount: 40 },
        { releasedAt: new Date(2026, 3, 9), releasedAmount: 15, amount: 20 },
        { releasedAt: null, releasedAmount: null, amount: 5 },
      ])
      .mockResolvedValueOnce([
        { id: "p1", amount: 25, scheduledDate: new Date("2026-05-01T00:00:00Z"), request: { id: "r1", label: "Sono" } },
      ]);

    const body = await (await get("?churchId=church-1")).json();
    expect(body.byMonth).toHaveLength(12);
    expect(body.byMonth[0]).toEqual({ month: "2025-06", submitted: 30, released: 0 });
    expect(body.byMonth[10]).toEqual({ month: "2026-04", submitted: 0, released: 55 });
    expect(body.byMonth[11]).toEqual({ month: "2026-05", submitted: 70, released: 0 });
    expect(body.overduePayments).toEqual([
      { id: "p1", requestId: "r1", requestLabel: "Sono", amount: 25, scheduledDate: "2026-05-01T00:00:00.000Z" },
    ]);
  });
});
