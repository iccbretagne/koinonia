import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { accountingMocks, entryRow, resetAccountingMocks } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/notifications", () => ({ notifyUsers: vi.fn() }));
const storeFile = vi.fn();
const readStoredFile = vi.fn();
vi.mock("@/lib/file-storage", () => ({ storeFile: (...a: unknown[]) => storeFile(...a), readStoredFile: (...a: unknown[]) => readStoredFile(...a) }));
vi.mock("@/modules/accounting", () => accountingMocks);

const { requestReimbursement, cancelReimbursement, importExpenseReport } = await import("../services/accounting-link");

const member = { id: "member-1", name: "Marc", manager: false };
const manager = { id: "compta-1", name: "Comptable", manager: true };

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { statusCode?: number };
  }
  throw new Error("aucun refus");
}

describe("liens avec la comptabilité (spec 073)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAccountingMocks();
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-nav", ministryId: "min-1" }]);
    prismaMock.memberUserLink.findUnique.mockResolvedValue({ memberId: "m1" });
    prismaMock.memberDepartment.findFirst.mockResolvedValue({ departmentId: "dept-nav" });
    prismaMock.shuttleEntry.update.mockResolvedValue({});
  });

  describe("A — remboursement d'une avance personnelle", () => {
    it("crée une note de frais au nom de l'auteur, avec le justificatif, rattachée à la Navette", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true, amount: -62 }));
      await requestReimbursement("e1", member);
      expect(accountingMocks.createLinkedExpenseReport).toHaveBeenCalledWith(
        expect.objectContaining({
          churchId: "church-1",
          departmentId: "dept-nav",
          submittedById: "member-1",
          amount: 62,
          receipt: expect.objectContaining({ key: "shuttle/church-1/x.jpg" }),
        })
      );
      expect(prismaMock.shuttleEntry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { reimbursementRequestId: "req-1" } });
    });

    it("réservé à l'auteur, sur une avance personnelle", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true }));
      expect((await rejection(requestReimbursement("e1", { ...member, id: "other" }))).statusCode).toBe(403);
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: false }));
      expect((await rejection(requestReimbursement("e1", member))).statusCode).toBe(400);
    });

    it("une seule demande en cours ; une nouvelle après un rejet", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true, reimbursementRequestId: "req-0" }));
      accountingMocks.getRequestsProgress.mockResolvedValue([{ id: "req-0", status: "PROCESSING", amount: 50, payments: [] }]);
      expect((await rejection(requestReimbursement("e1", member))).statusCode).toBe(409);
      accountingMocks.getRequestsProgress.mockResolvedValue([{ id: "req-0", status: "REJECTED", amount: 50, payments: [] }]);
      await expect(requestReimbursement("e1", member)).resolves.toEqual({ requestId: "req-1" });
    });

    it("annulation tant que la compta ne l'a pas prise en charge", async () => {
      prismaMock.shuttleEntry.findUnique.mockResolvedValue(entryRow({ personalAdvance: true, reimbursementRequestId: "req-1" }));
      await cancelReimbursement("e1", member);
      expect(accountingMocks.cancelOwnRequest).toHaveBeenCalledWith("req-1", "member-1");
      accountingMocks.cancelOwnRequest.mockResolvedValue(false);
      expect((await rejection(cancelReimbursement("e1", member))).statusCode).toBe(409);
    });
  });

  describe("C — note de frais hors registre", () => {
    const report = {
      id: "req-9",
      label: "Péage A84",
      amount: 12.5,
      status: "SUBMITTED",
      createdAt: new Date("2026-10-15T10:00:00Z"),
      submittedBy: { id: "u2", name: "Paul", email: null },
      attachments: [{ s3Key: "accounting/church-1/a.pdf", filename: "a.pdf", mimeType: "application/pdf", size: 10 }],
    };

    it("ajoutée au registre par la compta, justificatif copié", async () => {
      accountingMocks.listDepartmentExpenseReports.mockResolvedValue([report]);
      prismaMock.shuttleEntry.findFirst.mockResolvedValue(null);
      prismaMock.shuttleEntry.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.shuttleEntry.create.mockResolvedValue(entryRow({ id: "imp", amount: -12.5 }));
      readStoredFile.mockResolvedValue(Buffer.from("%PDF"));
      await importExpenseReport("church-1", "req-9", "TOLL_PARKING", manager);
      const data = prismaMock.shuttleEntry.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ kind: "EXPENSE", category: "TOLL_PARKING", amount: -12.5, sourceRequestId: "req-9", personalAdvance: true });
      expect(storeFile).toHaveBeenCalledWith(expect.stringMatching(/^shuttle\/church-1\//), expect.any(Buffer), "application/pdf");
    });

    it("refusée à un membre, et pour une note déjà dans le registre", async () => {
      expect((await rejection(importExpenseReport("church-1", "req-9", "FUEL", member))).statusCode).toBe(403);
      accountingMocks.listDepartmentExpenseReports.mockResolvedValue([report]);
      prismaMock.shuttleEntry.findFirst.mockResolvedValue({ id: "exists" });
      expect((await rejection(importExpenseReport("church-1", "req-9", "FUEL", manager))).statusCode).toBe(409);
      accountingMocks.listDepartmentExpenseReports.mockResolvedValue([]);
      expect((await rejection(importExpenseReport("church-1", "req-9", "FUEL", manager))).statusCode).toBe(404);
    });
  });
});
