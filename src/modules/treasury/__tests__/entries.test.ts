import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/file-storage", () => ({ storeFile: vi.fn(), readStoredFile: vi.fn() }));

const { createEntry, updateEntry, deleteEntry } = await import("../services/entries");

const actor = { id: "compta-1" };
const input = {
  accountId: "caisse",
  direction: "IN" as const,
  categoryId: "dimes",
  purposeId: null,
  method: "CASH" as const,
  amount: 120,
  date: "2026-11-02",
  label: "Dîme reçue",
  thirdParty: null,
};
const account = { id: "caisse", churchId: "church-1", openingDate: new Date("2026-10-01T00:00:00Z"), archivedAt: null };
const category = (p: Record<string, unknown> = {}) => ({ id: "dimes", churchId: "church-1", direction: "IN", active: true, system: null, name: "Dîmes", ...p });
const row = (p: Record<string, unknown> = {}) => ({
  id: "e1",
  churchId: "church-1",
  accountId: "caisse",
  kind: "STANDARD",
  direction: "IN",
  categoryId: "dimes",
  purposeId: null,
  method: "CASH",
  amount: 120,
  date: new Date("2026-11-02T00:00:00Z"),
  label: "Dîme reçue",
  thirdParty: null,
  depositRef: null,
  receiptName: null,
  transferGroupId: null,
  deletedAt: null,
  ...p,
});

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

describe("trésorerie — saisie des lignes (spec 076)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.treasuryClosure.findFirst.mockResolvedValue(null);
    prismaMock.treasuryAccount.findFirst.mockResolvedValue(account);
    prismaMock.treasuryCategory.findFirst.mockResolvedValue(category());
    prismaMock.treasuryEntry.findFirst.mockResolvedValue(null);
    prismaMock.treasuryEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row({ ...data, id: "new" }));
    prismaMock.treasuryEntry.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
    prismaMock.treasuryCheque.count.mockResolvedValue(0);
  });

  it("enregistre une entrée et la journalise", async () => {
    await createEntry("church-1", input, null, actor);
    const data = prismaMock.treasuryEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: "church-1", direction: "IN", amount: 120, createdById: "compta-1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "TreasuryEntry" }));
  });

  it("refuse une saisie datée d'un mois clôturé, avec un message clair", async () => {
    prismaMock.treasuryClosure.findFirst.mockResolvedValue({ month: "2026-11" });
    const e = await rejection(createEntry("church-1", input, null, actor));
    expect(e.statusCode).toBe(400);
    expect(e.message).toContain("Novembre 2026 est clôturé");
    expect(prismaMock.treasuryEntry.create).not.toHaveBeenCalled();
  });

  it("refuse un compte archivé ou une date antérieure au solde de départ", async () => {
    prismaMock.treasuryAccount.findFirst.mockResolvedValueOnce({ ...account, archivedAt: new Date() });
    expect((await rejection(createEntry("church-1", input, null, actor))).message).toContain("archivé");
    expect((await rejection(createEntry("church-1", { ...input, date: "2026-09-30" }, null, actor))).message).toContain("solde de départ");
  });

  it("refuse une catégorie d'un autre sens, désactivée, ou alimentée automatiquement", async () => {
    prismaMock.treasuryCategory.findFirst.mockResolvedValueOnce(category({ direction: "OUT" }));
    expect((await rejection(createEntry("church-1", input, null, actor))).statusCode).toBe(400);
    prismaMock.treasuryCategory.findFirst.mockResolvedValueOnce(category({ active: false }));
    expect((await rejection(createEntry("church-1", input, null, actor))).message).toContain("désactivée");
    prismaMock.treasuryCategory.findFirst.mockResolvedValueOnce(category({ direction: "OUT", system: "DEPOSIT", name: "Remises au compte commun" }));
    expect((await rejection(createEntry("church-1", { ...input, direction: "OUT" }, null, actor))).message).toContain("remise");
  });

  it("une offrande spéciale exige son objet", async () => {
    prismaMock.treasuryCategory.findFirst.mockResolvedValue(category({ system: "SPECIAL_OFFERING" }));
    expect((await rejection(createEntry("church-1", input, null, actor))).message).toContain("objet");
    prismaMock.treasuryPurpose.findFirst.mockResolvedValue({ id: "missions", active: true });
    await createEntry("church-1", { ...input, purposeId: "missions" }, null, actor);
    expect(prismaMock.treasuryEntry.create.mock.calls[0][0].data.purposeId).toBe("missions");
  });

  it("un doublon (date, montant, compte, catégorie) demande confirmation", async () => {
    prismaMock.treasuryEntry.findFirst.mockResolvedValue({ id: "twin" });
    expect((await rejection(createEntry("church-1", input, null, actor))).statusCode).toBe(409);
    await createEntry("church-1", { ...input, confirmDuplicate: true }, null, actor);
    expect(prismaMock.treasuryEntry.create).toHaveBeenCalledTimes(1);
  });

  it("une correction journalise l'avant et l'après, et vérifie l'ancien mois", async () => {
    prismaMock.treasuryEntry.findUnique.mockResolvedValue(row());
    await updateEntry("e1", { ...input, amount: 150 }, null, actor);
    const details = logAudit.mock.calls[0][0].details;
    expect(details.before.amount).toBe(120);
    expect(details.after.amount).toBe(150);
    expect(prismaMock.treasuryClosure.findFirst.mock.calls[0][0].where.month.in).toEqual(["2026-11"]);
  });

  it("une jambe de transfert ou une remise ne se corrige pas comme une ligne", async () => {
    prismaMock.treasuryEntry.findUnique.mockResolvedValueOnce(row({ kind: "TRANSFER" }));
    expect((await rejection(updateEntry("e1", input, null, actor))).statusCode).toBe(400);
    prismaMock.treasuryEntry.findUnique.mockResolvedValueOnce(row({ kind: "DEPOSIT" }));
    expect((await rejection(updateEntry("e1", input, null, actor))).statusCode).toBe(400);
  });

  it("supprimer un transfert supprime ses deux jambes, logiquement", async () => {
    const out = row({ id: "t1", kind: "TRANSFER", transferGroupId: "g", direction: "OUT" });
    const inn = row({ id: "t2", kind: "TRANSFER", transferGroupId: "g", direction: "IN", accountId: "coffre" });
    prismaMock.treasuryEntry.findUnique.mockResolvedValue(out);
    prismaMock.treasuryEntry.findMany.mockResolvedValue([out, inn]);
    await deleteEntry("t1", actor, new Date("2026-11-03T10:00:00Z"));
    const call = prismaMock.treasuryEntry.updateMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(["t1", "t2"]);
    expect(call.data).toMatchObject({ deletedById: "compta-1" });
    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it("supprimer une remise remet ses chèques en caisse ; une ligne de chèques déjà remis est refusée", async () => {
    prismaMock.treasuryEntry.findUnique.mockResolvedValueOnce(row({ id: "dep", kind: "DEPOSIT", direction: "OUT" }));
    await deleteEntry("dep", actor);
    expect(prismaMock.treasuryCheque.updateMany).toHaveBeenCalledWith({ where: { depositEntryId: "dep" }, data: { depositEntryId: null } });
    prismaMock.treasuryEntry.findUnique.mockResolvedValueOnce(row({ method: "CHEQUE" }));
    prismaMock.treasuryCheque.count.mockResolvedValueOnce(2);
    expect((await rejection(deleteEntry("e1", actor))).message).toContain("remis");
  });
});
