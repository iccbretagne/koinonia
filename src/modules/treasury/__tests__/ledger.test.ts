import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import type { AccountView } from "../services/accounts";
import type { RawLine } from "../services/ledger";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { computeLedger } = await import("../services/ledger");

const account = (id: string, openingBalance: number, kind: AccountView["kind"] = "CASH"): AccountView => ({
  id,
  name: id,
  kind,
  openingBalance,
  openingDate: "2026-10-01",
  archived: false,
  sortOrder: 0,
});

let seq = 0;
const line = (p: Partial<RawLine> & Pick<RawLine, "accountId" | "direction" | "amount" | "date">): RawLine => ({
  id: `l${++seq}`,
  source: "treasury",
  kind: "STANDARD",
  accountName: p.accountId,
  categoryId: "cat",
  categoryName: "Dîmes",
  categorySystem: null,
  purposeId: null,
  purposeName: null,
  method: "CASH",
  label: "x",
  thirdParty: null,
  depositRef: null,
  collectionId: null,
  transferGroupId: null,
  hasReceipt: false,
  link: null,
  createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}Z`,
  ...p,
});

const caisse = account("caisse", 2150);
const coffre = account("coffre", 700);
const lines: RawLine[] = [
  line({ accountId: "caisse", direction: "IN", amount: 1240, date: "2026-10-04" }),
  line({ accountId: "caisse", direction: "OUT", amount: 2900, date: "2026-10-07", kind: "DEPOSIT" }),
  line({ accountId: "caisse", direction: "OUT", amount: 500, date: "2026-10-21", kind: "TRANSFER", transferGroupId: "g", categoryId: null }),
  line({ accountId: "coffre", direction: "IN", amount: 500, date: "2026-10-21", kind: "TRANSFER", transferGroupId: "g", categoryId: null }),
  line({ accountId: "caisse", direction: "IN", amount: 0.1, date: "2026-11-02" }),
  line({ accountId: "caisse", direction: "IN", amount: 0.2, date: "2026-11-02" }),
];

describe("registre de trésorerie — calcul (spec 076)", () => {
  it("solde après chaque ligne d'un compte, en centimes exacts", () => {
    const r = computeLedger([caisse, coffre], lines, { accountId: "caisse" }, "2026-12-31");
    expect(r.lines.map((l) => l.runningBalance)).toEqual([3390, 490, -10, -9.9, -9.7]);
    expect(r.accounts.find((a) => a.id === "caisse")?.balance).toBe(-9.7);
  });

  it("tous comptes : un transfert ne change pas le total et n'est ni entrée ni sortie", () => {
    const r = computeLedger([caisse, coffre], lines, { from: "2026-10-01", to: "2026-10-31" }, "2026-12-31");
    expect(r.period).toEqual({ opening: 2850, inflows: 1240, outflows: 2900, closing: 1190 });
    expect(r.total).toBe(euroSum(r.accounts.map((a) => a.balance)));
  });

  it("un seul compte : le transfert compte dans ses sorties, et la période se recoupe", () => {
    const { period } = computeLedger([caisse, coffre], lines, { accountId: "caisse", from: "2026-10-05", to: "2026-10-31" }, "2026-12-31");
    expect(period.opening).toBe(3390);
    expect(period.outflows).toBe(3400);
    expect(Math.round((period.opening + period.inflows - period.outflows) * 100)).toBe(Math.round(period.closing * 100));
  });

  it("signale une caisse qui passe sous zéro, une fois, à la première ligne en cause", () => {
    const r = computeLedger([caisse, coffre], lines, {}, "2026-12-31");
    expect(r.warnings).toEqual([{ accountId: "caisse", accountName: "caisse", date: "2026-10-21", balance: -10 }]);
  });

  it("un compte en ligne négatif n'est pas signalé comme une caisse", () => {
    const online = account("caisse", 0, "ONLINE");
    const r = computeLedger([online], [line({ accountId: "caisse", direction: "OUT", amount: 5, date: "2026-10-02" })], {}, "2026-12-31");
    expect(r.warnings).toEqual([]);
  });

  it("les filtres catégorie et moyen n'affichent que les lignes voulues sans changer les totaux", () => {
    const r = computeLedger([caisse, coffre], lines, { method: "CHEQUE" }, "2026-12-31");
    expect(r.lines).toEqual([]);
    expect(r.period.inflows).toBe(1240.3);
  });

  it("les lignes postérieures à `to` ne comptent pas", () => {
    const r = computeLedger([caisse], lines, { accountId: "caisse", to: "2026-10-31" }, "2026-12-31");
    expect(r.period.closing).toBe(-10);
  });
});

function euroSum(xs: number[]) {
  return xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
}
