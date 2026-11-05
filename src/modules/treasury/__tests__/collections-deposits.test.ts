import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { createCollection } = await import("../services/collections");
const { createDeposit, listChequesInHand } = await import("../services/deposits");
const { createTransfer } = await import("../services/transfers");
const { closeMonth, reopenMonth } = await import("../services/closures");

const actor = { id: "compta-1" };
const account = { id: "caisse", name: "Caisse principale", churchId: "church-1", openingDate: new Date("2026-10-01T00:00:00Z"), archivedAt: null };

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])
  );
  prismaMock.treasuryClosure.findFirst.mockResolvedValue(null);
  prismaMock.treasuryAccount.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ ...account, id: where.id, name: where.id }));
  prismaMock.treasuryCategory.count.mockResolvedValue(17);
});

describe("collecte de culte (spec 076)", () => {
  const input = {
    accountId: "caisse",
    eventId: null,
    date: "2026-11-01",
    counter1: "Marie K.",
    counter2: "Paul D.",
    lines: [
      { categoryId: "dimes", purposeId: null, cash: 1120, cheques: [{ number: "0000101", amount: 200, count: 1 }, { number: null, amount: 150, count: 1 }] },
      { categoryId: "speciale", purposeId: "togo", cash: 150, cheques: [] },
    ],
  };

  beforeEach(() => {
    prismaMock.treasuryCategory.findMany.mockResolvedValue([
      { id: "dimes", churchId: "church-1", direction: "IN", active: true, system: null, name: "Dîmes" },
      { id: "speciale", churchId: "church-1", direction: "IN", active: true, system: "SPECIAL_OFFERING", name: "Offrandes spéciales" },
    ]);
    prismaMock.treasuryPurpose.findMany.mockResolvedValue([{ id: "togo" }]);
  });

  it("crée une ligne par catégorie et par moyen, et les chèques en caisse", async () => {
    await createCollection("church-1", input, actor);
    const entries = prismaMock.treasuryEntry.createMany.mock.calls[0][0].data;
    expect(entries.map((e: { categoryId: string; method: string; amount: number }) => [e.categoryId, e.method, e.amount])).toEqual([
      ["dimes", "CASH", 1120],
      ["dimes", "CHEQUE", 350],
      ["speciale", "CASH", 150],
    ]);
    expect(entries[0].label).toBe("Collecte du culte du 1er novembre");
    const cheques = prismaMock.treasuryCheque.createMany.mock.calls[0][0].data;
    expect(cheques).toHaveLength(2);
    expect(cheques[0].entryId).toBe(entries[1].id);
    const collection = prismaMock.treasuryCollection.create.mock.calls[0][0].data;
    expect([collection.counter1, collection.counter2]).toEqual(["Marie K.", "Paul D."]);
  });

  it("refuse une offrande spéciale sans objet et une catégorie de sortie", async () => {
    const noPurpose = { ...input, lines: [{ ...input.lines[1], purposeId: null }] };
    expect((await rejection(createCollection("church-1", noPurpose, actor))).message).toContain("objet");
    prismaMock.treasuryCategory.findMany.mockResolvedValueOnce([{ id: "dimes", direction: "OUT", active: true, system: null }]);
    expect((await rejection(createCollection("church-1", { ...input, lines: [input.lines[0]] }, actor))).statusCode).toBe(400);
  });
});

describe("remise au compte commun (spec 076)", () => {
  const cheque = (id: string, p: Record<string, unknown> = {}) => ({
    id,
    amount: 100,
    count: 1,
    depositEntryId: null,
    entry: { accountId: "caisse", deletedAt: null, date: new Date("2026-11-01T00:00:00Z") },
    ...p,
  });

  beforeEach(() => {
    prismaMock.treasuryCategory.findFirst.mockResolvedValue({ id: "remises", name: "Remises au compte commun", system: "DEPOSIT" });
    prismaMock.treasuryEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "dep", ...data }));
    prismaMock.treasuryCheque.updateMany.mockResolvedValue({ count: 2 });
  });

  it("sort espèces + chèques cochés de la caisse, avec le bordereau, et sort les chèques de la caisse", async () => {
    prismaMock.treasuryCheque.findMany.mockResolvedValue([cheque("c1"), cheque("c2", { amount: 50 })]);
    const r = await createDeposit("church-1", { accountId: "caisse", date: "2026-11-02", ref: "0414", cashAmount: 1680, chequeIds: ["c1", "c2"] }, actor);
    expect(r).toEqual({ id: "dep", amount: 1830, cheques: 2 });
    const data = prismaMock.treasuryEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: "DEPOSIT", direction: "OUT", categoryId: "remises", depositRef: "0414" });
    expect(prismaMock.treasuryCheque.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] }, depositEntryId: null }, data: { depositEntryId: "dep" } });
  });

  it("refuse un chèque déjà remis, d'un autre compte ou collecté après la remise", async () => {
    const base = { accountId: "caisse", date: "2026-11-02", ref: "1", cashAmount: 0, chequeIds: ["c1"] };
    prismaMock.treasuryCheque.findMany.mockResolvedValueOnce([cheque("c1", { depositEntryId: "old" })]);
    expect((await rejection(createDeposit("church-1", base, actor))).message).toContain("plus en caisse");
    prismaMock.treasuryCheque.findMany.mockResolvedValueOnce([cheque("c1", { entry: { accountId: "coffre", deletedAt: null, date: new Date("2026-11-01") } })]);
    expect((await rejection(createDeposit("church-1", base, actor))).message).toContain("pas dans ce compte");
    prismaMock.treasuryCheque.findMany.mockResolvedValueOnce([cheque("c1", { entry: { accountId: "caisse", deletedAt: null, date: new Date("2026-11-05T00:00:00Z") } })]);
    expect((await rejection(createDeposit("church-1", base, actor))).message).toContain("après");
  });

  it("les chèques en caisse excluent les chèques remis et les lignes supprimées", async () => {
    prismaMock.treasuryCheque.findMany.mockResolvedValue([]);
    await listChequesInHand("church-1", "caisse");
    expect(prismaMock.treasuryCheque.findMany.mock.calls[0][0].where).toEqual({
      churchId: "church-1",
      depositEntryId: null,
      entry: { deletedAt: null, accountId: "caisse" },
    });
  });
});

describe("transferts et clôture (spec 076)", () => {
  it("un transfert crée deux jambes liées, sortie puis entrée", async () => {
    prismaMock.treasuryEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: String(data.direction), date: new Date(), amount: data.amount, ...data }));
    const r = await createTransfer("church-1", { fromId: "caisse", toId: "coffre", date: "2026-11-02", amount: 500, label: null }, actor);
    const [out, inn] = prismaMock.treasuryEntry.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect([out.direction, out.accountId, inn.direction, inn.accountId]).toEqual(["OUT", "caisse", "IN", "coffre"]);
    expect(out.transferGroupId).toBe(inn.transferGroupId);
    expect(out.kind).toBe("TRANSFER");
    expect(out.categoryId).toBeUndefined();
    expect(r.ids).toHaveLength(2);
  });

  it("seul un mois terminé se clôture", async () => {
    const now = new Date("2026-11-05T00:00:00Z");
    expect((await rejection(closeMonth("church-1", "2026-11", actor, now))).statusCode).toBe(400);
    prismaMock.treasuryClosure.findUnique.mockResolvedValue(null);
    await closeMonth("church-1", "2026-10", actor, now);
    expect(prismaMock.treasuryClosure.create).toHaveBeenCalledWith({ data: { churchId: "church-1", month: "2026-10", closedById: "compta-1" } });
  });

  it("rouvrir un mois conserve le motif dans l'historique", async () => {
    prismaMock.treasuryClosure.findUnique.mockResolvedValue({ churchId: "church-1", month: "2026-10", closedAt: new Date("2026-11-03T00:00:00Z") });
    await reopenMonth("church-1", "2026-10", "Chèque du 30/10 oublié", actor);
    expect(prismaMock.treasuryClosure.delete).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TreasuryClosure", action: "DELETE", details: expect.objectContaining({ reason: "Chèque du 30/10 oublié" }) }));
  });
});
