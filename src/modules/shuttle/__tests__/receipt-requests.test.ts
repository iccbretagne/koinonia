import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { entryRow, jpegFile } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const deleteFile = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/file-storage", () => ({ storeFile: vi.fn(), readStoredFile: vi.fn(), deleteFile: (...a: unknown[]) => deleteFile(...a) }));

const { requestReceipt, cancelReceiptRequest, submitRequestedReceipt } = await import("../services/receipt-requests");

const author = { id: "member-1", name: "Marc", manager: false };
const manager = { id: "compta-1", name: "Comptable", manager: true };
const NOW = new Date("2026-11-22T10:00:00Z");
// Ligne vieille de plus de 48 h : le dépôt doit passer malgré tout.
const old = (p: Record<string, unknown> = {}) => entryRow({ createdAt: new Date("2026-11-01T10:00:00Z"), ...p });

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
  prismaMock.shuttleEntry.update.mockResolvedValue(entryRow());
  prismaMock.shuttleEntry.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "compta-1" }]);
});

describe("demande de justificatif de la navette (spec 086)", () => {
  it("la gestion demande, l'auteur est notifié, journalisé", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old());
    await requestReceipt("e1", "La photo du ticket", manager, NOW);
    expect(prismaMock.shuttleEntry.update.mock.calls[0][0].data).toMatchObject({ receiptRequestedAt: NOW, receiptRequestNote: "La photo du ticket" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "ShuttleEntry", details: { receiptRequest: "request", note: "La photo du ticket" } }));
    expect(notifyUsers).toHaveBeenCalledWith(["member-1"], expect.objectContaining({ type: "SHUTTLE_RECEIPT_REQUESTED" }));
  });

  it("réservé à la gestion", async () => {
    expect((await rejection(requestReceipt("e1", undefined, author))).statusCode).toBe(403);
    expect((await rejection(cancelReceiptRequest("e1", author))).statusCode).toBe(403);
  });

  it("refuse une ligne supprimée", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ deletedAt: NOW }));
    expect((await rejection(requestReceipt("e1", undefined, manager))).statusCode).toBe(404);
  });

  it("annulation : remet l'état à zéro", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ receiptRequestedAt: NOW }));
    await cancelReceiptRequest("e1", manager);
    expect(prismaMock.shuttleEntry.update.mock.calls[0][0].data).toMatchObject({ receiptRequestedAt: null, receiptRequestCount: 0 });
  });

  it("l'auteur redépose hors des 48 h, la compta est prévenue", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ receiptRequestedAt: NOW }));
    await submitRequestedReceipt("e1", jpegFile(), author);
    const call = prismaMock.shuttleEntry.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "e1", receiptRequestedAt: { not: null } });
    expect(Object.keys(call.data).sort()).toEqual(
      ["receiptKey", "receiptMime", "receiptName", "receiptRequestCount", "receiptRequestLastAt", "receiptRequestNote", "receiptRequestedAt", "receiptSize", "updatedById"].sort()
    );
    expect(notifyUsers).toHaveBeenCalledWith(["compta-1"], expect.objectContaining({ type: "SHUTTLE_RECEIPT_SUBMITTED" }));
  });

  it("un autre membre est refusé", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ receiptRequestedAt: NOW }));
    expect((await rejection(submitRequestedReceipt("e1", jpegFile(), { id: "other", name: "X", manager: false }))).statusCode).toBe(403);
  });

  it("refuse sans demande en cours, ou si la ligne est supprimée", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old());
    expect((await rejection(submitRequestedReceipt("e1", jpegFile(), author))).statusCode).toBe(400);
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ receiptRequestedAt: NOW, deletedAt: NOW }));
    expect((await rejection(submitRequestedReceipt("e1", jpegFile(), author))).statusCode).toBe(404);
  });

  it("prise perdue : fichier supprimé, personne prévenu", async () => {
    prismaMock.shuttleEntry.findUnique.mockResolvedValue(old({ receiptRequestedAt: NOW }));
    prismaMock.shuttleEntry.updateMany.mockResolvedValue({ count: 0 });
    expect((await rejection(submitRequestedReceipt("e1", jpegFile(), author))).statusCode).toBe(400);
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
