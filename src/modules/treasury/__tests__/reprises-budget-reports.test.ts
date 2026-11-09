import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import type { CategoryView } from "../services/categories";
import type { RawLine } from "../services/ledger";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
let shuttleEnabled = true;
vi.mock("@/lib/registry", () => ({ registry: { has: (m: string) => m !== "shuttle" || shuttleEnabled } }));
const listTreasuryPayments = vi.fn();
const listTreasuryReturns = vi.fn();
vi.mock("@/modules/accounting", () => ({ listTreasuryPayments: (...a: unknown[]) => listTreasuryPayments(...a), listTreasuryReturns: (...a: unknown[]) => listTreasuryReturns(...a) }));

const { loadRepriseLines } = await import("../services/reprises");
const { compareBudget, splitAnnual, actualByCategory, setBudget } = await import("../services/budget");
const { computeReports } = await import("../services/reports");

const accounts = [{ id: "caisse", name: "Caisse principale", kind: "CASH" as const, openingBalance: 0, openingDate: "2026-01-01", archived: false, sortOrder: 0 }];
const system = { EXPENSE_REPORTS: { id: "ndf", name: "Notes de frais et avances", system: "EXPENSE_REPORTS" }, SHUTTLE: { id: "nav", name: "Navette", system: "SHUTTLE" } };

describe("reprises par lecture (spec 076, ADR-0027)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shuttleEnabled = true;
    prismaMock.treasuryCategory.count.mockResolvedValue(17);
    prismaMock.treasuryCategory.findFirst.mockImplementation(async ({ where }: { where: { system: keyof typeof system } }) => system[where.system]);
    prismaMock.shuttleEntry.findMany.mockResolvedValue([
      { id: "f1", treasuryAccountId: "caisse", amount: 300, date: new Date("2026-10-14T00:00:00Z"), label: null, paymentMethod: "CASH", createdAt: new Date("2026-10-14T09:00:00Z") },
    ]);
    listTreasuryPayments.mockResolvedValue([
      { id: "p1", treasuryAccountId: "caisse", releasedAt: new Date("2026-10-09T00:00:00Z"), releasedAmount: 84.9, amount: 90, request: { id: "r1", label: "Câbles sono", type: "EXPENSE_REPORT", department: { function: null } } },
      { id: "p2", treasuryAccountId: "caisse", releasedAt: new Date("2026-10-10T00:00:00Z"), releasedAmount: null, amount: 200, request: { id: "r2", label: "Carburant", type: "BUDGET_ADVANCE", department: { function: "NAVETTE" } } },
    ]);
    listTreasuryReturns.mockResolvedValue([]);
  });

  it("un reliquat d'avance rendu sur une caisse est une entrée reprise, liée à sa demande (spec 078)", async () => {
    listTreasuryReturns.mockResolvedValue([
      { id: "j1", treasuryAccountId: "caisse", returnedAt: new Date("2026-10-20T00:00:00Z"), amount: 31.6, requestId: "r3", label: "Micros" },
      { id: "j2", treasuryAccountId: "ailleurs", returnedAt: new Date("2026-10-21T00:00:00Z"), amount: 10, requestId: "r4", label: "Autre église" },
    ]);
    const lines = await loadRepriseLines("church-1", accounts);
    expect(lines.find((l) => l.id === "return:j1")).toMatchObject({
      source: "accounting",
      direction: "IN",
      amount: 31.6,
      date: "2026-10-20",
      categoryId: "ndf",
      label: "Reliquat rendu · Micros",
      link: "/accounting/requests/r3",
    });
    expect(lines.some((l) => l.id === "return:j2")).toBe(false);
    expect(listTreasuryReturns).toHaveBeenCalledWith("church-1");
  });

  it("un paiement versé depuis une caisse est une sortie reprise, en lecture seule, avec son origine", async () => {
    const lines = await loadRepriseLines("church-1", accounts);
    const p1 = lines.find((l) => l.id === "payment:p1")!;
    expect(p1).toMatchObject({ source: "accounting", direction: "OUT", amount: 84.9, date: "2026-10-09", categoryId: "ndf", link: "/accounting/requests/r1" });
    expect(lines.find((l) => l.id === "payment:p2")).toMatchObject({ categoryId: "nav", amount: 200, label: "Avance de budget · Carburant" });
  });

  it("un abondement de la navette remis depuis une caisse est une sortie « Navette »", async () => {
    const lines = await loadRepriseLines("church-1", accounts);
    expect(lines.find((l) => l.id === "shuttle:f1")).toMatchObject({ source: "shuttle", direction: "OUT", amount: 300, categoryId: "nav" });
  });

  it("navette désactivée : aucune ligne de la navette n'est reprise", async () => {
    shuttleEnabled = false;
    const lines = await loadRepriseLines("church-1", accounts);
    expect(lines.some((l) => l.source === "shuttle")).toBe(false);
    expect(prismaMock.shuttleEntry.findMany).not.toHaveBeenCalled();
  });

  it("seuls les paiements portant un compte de trésorerie de l'église sont lus", async () => {
    await loadRepriseLines("church-1", accounts);
    expect(listTreasuryPayments).toHaveBeenCalledWith("church-1");
    expect(prismaMock.shuttleEntry.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "church-1", kind: "FUNDING", deletedAt: null, treasuryAccountId: { not: null } });
    const lines = await loadRepriseLines("church-1", []);
    expect(lines).toEqual([]);
  });
});

const cat = (id: string, direction: "IN" | "OUT", name = id): CategoryView => ({ id, direction, name, system: null, active: true, sortOrder: 0 });
const raw = (categoryId: string, direction: "IN" | "OUT", amount: number, date: string, p: Partial<RawLine> = {}): RawLine => ({
  id: `${categoryId}-${date}-${amount}`,
  source: "treasury",
  kind: "STANDARD",
  accountId: "caisse",
  accountName: "Caisse",
  direction,
  categoryId,
  categoryName: categoryId,
  categorySystem: null,
  purposeId: null,
  purposeName: null,
  method: "CASH",
  amount,
  date,
  label: "",
  thirdParty: null,
  depositRef: null,
  collectionId: null,
  transferGroupId: null,
  hasReceipt: false,
  link: null,
  createdAt: `${date}T00:00:00Z`,
  ...p,
});

describe("budget prévisionnel (spec 076)", () => {
  it("répartit un montant annuel en 12 mois au centime, le reste sur décembre", () => {
    const months = splitAnnual(1000);
    expect(months.slice(0, 11).every((m) => m === 83.33)).toBe(true);
    expect(months[11]).toBe(83.37);
    expect(months.reduce((s, m) => s + Math.round(m * 100), 0)).toBe(100000);
  });

  it("compare réalisé et budget, signale un dépassement et une catégorie à surveiller", () => {
    const lines = [
      raw("materiel", "OUT", 6540, "2026-06-10"),
      raw("energie", "OUT", 3680, "2026-09-10"),
      raw("dimes", "IN", 9000, "2026-10-04"),
      raw("materiel", "OUT", 999, "2025-06-10"),
      raw("x", "OUT", 500, "2026-10-21", { kind: "TRANSFER", categoryId: null }),
    ];
    const budget = [
      { categoryId: "materiel", monthly: splitAnnual(6000), annual: 6000 },
      { categoryId: "energie", monthly: splitAnnual(4000), annual: 4000 },
      { categoryId: "dimes", monthly: splitAnnual(120000), annual: 120000 },
    ];
    const rows = compareBudget([cat("dimes", "IN"), cat("energie", "OUT"), cat("materiel", "OUT")], budget, actualByCategory(lines, 2026), 10);
    const byId = Object.fromEntries(rows.map((r) => [r.categoryId, r]));
    expect(byId.materiel).toMatchObject({ yearActual: 6540, overBudget: true, warning: false });
    expect(byId.energie).toMatchObject({ yearActual: 3680, overBudget: false, warning: true });
    expect(byId.dimes).toMatchObject({ overBudget: false, warning: false });
    expect(byId.dimes.month).toEqual({ budget: 10000, actual: 9000, gap: -1000, ratio: 0.9 });
    expect(byId.dimes.ytd.budget).toBe(100000);
  });

  it("enregistre le budget mensuel et le journalise", async () => {
    prismaMock.treasuryCategory.count.mockResolvedValue(1);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.treasuryBudget.findMany.mockResolvedValue([]);
    await setBudget("church-1", { year: 2027, rows: [{ categoryId: "dimes", annual: 1200 }] }, { id: "compta-1" });
    const data = prismaMock.treasuryBudget.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(12);
    expect(data[0]).toMatchObject({ year: 2027, month: 1, categoryId: "dimes", amount: 100 });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TreasuryBudget" }));
  });
});

describe("rapports (spec 076)", () => {
  const lines = [
    raw("dimes", "IN", 1240, "2026-10-04"),
    raw("speciale", "IN", 620, "2026-10-18", { purposeId: "togo", purposeName: "Mission Togo" }),
    raw("dimes", "IN", 1150, "2026-10-04", { method: "CHEQUE" }),
    raw("remises", "OUT", 2900, "2026-10-07"),
    raw("x", "OUT", 500, "2026-10-21", { kind: "TRANSFER", categoryId: null }),
    raw("x", "IN", 500, "2026-10-21", { kind: "TRANSFER", categoryId: null, accountId: "coffre" }),
    raw("dimes", "IN", 980, "2026-11-01"),
  ];

  it("par catégorie, objet, moyen et mois : se recoupent avec les totaux, transferts exclus", () => {
    const r = computeReports(lines, "2026-10-01", "2026-10-31");
    expect(r.inflows).toBe(3010);
    expect(r.outflows).toBe(2900);
    expect(r.byCategory.find((c) => c.categoryId === "dimes")?.total).toBe(2390);
    expect(r.byPurpose).toEqual([{ purposeId: "togo", name: "Mission Togo", total: 620 }]);
    const sum = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
    expect(sum(r.byMethod.map((m) => m.inflows))).toBe(r.inflows);
    expect(sum(r.byCategory.filter((c) => c.direction === "IN").map((c) => c.total))).toBe(r.inflows);
    expect(r.byMonth).toEqual([{ month: "2026-10", inflows: 3010, outflows: 2900 }]);
  });
});
