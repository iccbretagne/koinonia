import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { accountingMocks, entryRow, jpegFile, resetAccountingMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
vi.mock("@/lib/file-storage", () => ({ storeFile: vi.fn(), readStoredFile: vi.fn() }));
vi.mock("@/modules/accounting", () => accountingMocks);

const { createEntry, updateEntry, deleteEntry } = await import("../services/ledger");

const member = { id: "member-1", name: "Marc", manager: false };
const manager = { id: "compta-1", name: "Comptable", manager: true };
const expense = { kind: "EXPENSE" as const, amount: 62, date: "2026-11-02", category: "FUEL" as const, label: null, vendor: "Super U", liters: null, kilometers: null, personalAdvance: false, rentalId: null };

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number; message: string };
  }
  throw new Error("aucun refus");
}

describe("registre de la navette — écriture (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAccountingMocks();
    prismaMock.shuttleEntry.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-nav", ministryId: "min-1" }]);
    prismaMock.shuttleEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => entryRow({ ...data, id: "new" }));
    prismaMock.shuttleEntry.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => entryRow({ ...data }));
    prismaMock.shuttleSettings.findUnique.mockResolvedValue(null);
    prismaMock.shuttleSettings.upsert.mockResolvedValue({});
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "compta-1" }]);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
  });

  it("une dépense est enregistrée en négatif, sans validation, et prévient la compta", async () => {
    await createEntry("church-1", expense, jpegFile(), member);
    const data = prismaMock.shuttleEntry.create.mock.calls[0][0].data;
    expect(data.amount).toBe(-62);
    expect(data.receiptMime).toBe("image/jpeg");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "ShuttleEntry" }));
    expect(notifyUsers).toHaveBeenCalledWith(["compta-1"], expect.objectContaining({ domain: "shuttle", type: "SHUTTLE_ENTRY_CREATE" }));
  });

  it("la compta qui saisit n'est pas notifiée d'elle-même", async () => {
    await createEntry("church-1", { kind: "FUNDING", amount: 200, date: "2026-11-01", label: null, paymentMethod: "CASH" }, null, manager);
    expect(prismaMock.shuttleEntry.create.mock.calls[0][0].data.amount).toBe(200);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("justificatif obligatoire pour une dépense", async () => {
    const err = await rejection(createEntry("church-1", expense, null, member));
    expect(err.statusCode).toBe(400);
    expect(prismaMock.shuttleEntry.create).not.toHaveBeenCalled();
  });

  it("un justificatif qui n'est ni image ni PDF est refusé sur son contenu", async () => {
    const fake = new File([new TextEncoder().encode("<svg/>")], "ticket.jpg", { type: "image/jpeg" });
    const err = await rejection(createEntry("church-1", expense, fake, member));
    expect(err.statusCode).toBe(400);
  });

  it.each(["FUNDING", "OPENING_BALANCE"] as const)("%s refusé à un membre", async (kind) => {
    const input = kind === "FUNDING"
      ? { kind, amount: 10, date: "2026-11-01", label: null, paymentMethod: "CASH" as const }
      : { kind, amount: 10, date: "2026-11-01", label: null };
    const err = await rejection(createEntry("church-1", input, null, member));
    expect(err.statusCode).toBe(403);
  });

  it("un seul solde de départ par église", async () => {
    prismaMock.shuttleEntry.findFirst.mockResolvedValue({ id: "existing" });
    const err = await rejection(createEntry("church-1", { kind: "OPENING_BALANCE", amount: -20, date: "2026-10-31", label: null }, null, manager));
    expect(err.statusCode).toBe(409);
  });

  it("le solde de départ peut être négatif", async () => {
    prismaMock.shuttleEntry.findFirst.mockResolvedValue(null);
    await createEntry("church-1", { kind: "OPENING_BALANCE", amount: -20, date: "2026-10-31", label: null }, null, manager);
    expect(prismaMock.shuttleEntry.create.mock.calls[0][0].data.amount).toBe(-20);
  });

  it("alerte au franchissement du seuil, pas quand le solde était déjà dessous", async () => {
    prismaMock.shuttleSettings.findUnique.mockResolvedValue({ lowBalanceThreshold: 50 });
    prismaMock.shuttleEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } }).mockResolvedValueOnce({ _sum: { amount: 38 } });
    prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "lead-1" } }]);
    await createEntry("church-1", expense, jpegFile(), member);
    expect(notifyUsers).toHaveBeenCalledWith(
      expect.arrayContaining(["compta-1", "lead-1"]),
      expect.objectContaining({ type: "SHUTTLE_LOW_BALANCE" })
    );

    notifyUsers.mockClear();
    prismaMock.shuttleEntry.aggregate.mockResolvedValueOnce({ _sum: { amount: 30 } }).mockResolvedValueOnce({ _sum: { amount: 10 } });
    await createEntry("church-1", expense, jpegFile(), member);
    expect(notifyUsers).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "SHUTTLE_LOW_BALANCE" }));
  });

  describe("corrections", () => {
    const now = new Date("2026-11-03T09:00:00Z");

    it("l'auteur corrige sa ligne dans les 48 h ; l'historique garde l'avant et l'après", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow());
      await updateEntry("e1", { ...expense, amount: 70 }, null, member, now);
      const details = logAudit.mock.calls.at(-1)![0].details;
      expect(details.before.amount).toBe(-50);
      expect(details.after.amount).toBe(-70);
      expect(notifyUsers).toHaveBeenCalledWith(["compta-1"], expect.objectContaining({ type: "SHUTTLE_ENTRY_UPDATE" }));
    });

    it("après 48 h, l'auteur ne peut plus ; la compta si", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow());
      const late = new Date("2026-11-05T11:00:00Z");
      expect((await rejection(updateEntry("e1", expense, null, member, late))).statusCode).toBe(403);
      await expect(updateEntry("e1", expense, null, manager, late)).resolves.toBeTruthy();
    });

    it("un autre membre ne peut pas corriger la ligne", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow());
      const other = { id: "member-2", name: "Paul", manager: false };
      expect((await rejection(updateEntry("e1", expense, null, other, now))).statusCode).toBe(403);
    });

    it("une ligne avec un remboursement en cours est figée pour le membre", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true, reimbursementRequestId: "req-1" }));
      accountingMocks.getRequestsProgress.mockResolvedValue([{ id: "req-1", status: "SUBMITTED", amount: 50, payments: [], rejectionReason: null }]);
      expect((await rejection(deleteEntry("e1", member, now))).statusCode).toBe(403);
    });

    it("après un rejet du remboursement, la ligne redevient modifiable", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true, reimbursementRequestId: "req-1" }));
      accountingMocks.getRequestsProgress.mockResolvedValue([{ id: "req-1", status: "REJECTED", amount: 50, payments: [], rejectionReason: "doublon" }]);
      await expect(deleteEntry("e1", member, now)).resolves.toBeUndefined();
    });

    it("la suppression est logique et notifie la compta", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow());
      await deleteEntry("e1", member, now);
      expect(prismaMock.shuttleEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: now, deletedById: "member-1" }) })
      );
      expect(prismaMock.shuttleEntry.delete).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE" }));
      expect(notifyUsers).toHaveBeenCalledWith(["compta-1"], expect.objectContaining({ type: "SHUTTLE_ENTRY_DELETE" }));
    });

    it("la nature d'une ligne ne change pas", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow());
      const err = await rejection(updateEntry("e1", { kind: "VENDOR_REFUND", amount: 5, date: "2026-11-02", label: null, vendor: null, rentalId: null }, jpegFile(), manager, now));
      expect(err.statusCode).toBe(400);
    });
  });
});
