/**
 * Tests — spec 086 : « Demander une pièce » (Prisma mocké).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const createNotification = vi.fn();
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a), notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const storeFile = vi.fn();
const deleteFile = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/file-storage", () => ({ storeFile: (...a: unknown[]) => storeFile(...a), deleteFile: (...a: unknown[]) => deleteFile(...a) }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  buildGenericNotificationEmail: () => ({ subject: "s", html: "h" }),
  parseEmailList: () => [],
}));

const { requestPiece, cancelPieceRequest, submitPieces } = await import("../piece-requests");

const compta = { id: "compta-1", name: "Comptable" };
const demandeur = { id: "user-1", name: "Marie" };
const NOW = new Date("2026-11-22T10:00:00Z");

const request = (p: Record<string, unknown> = {}) => ({
  id: "req-1",
  churchId: "church-1",
  submittedById: "user-1",
  label: "Courses",
  status: "PROCESSING",
  pieceRequestedAt: null,
  pieceRequestLastAt: null,
  pieceRequestCount: 0,
  pieceRequestNote: null,
  ...p,
});
const pdf = (name = "facture.pdf", type = "application/pdf", size = 100) => new File([new Uint8Array(size)], name, { type });

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
  prismaMock.userChurchRole.count.mockResolvedValue(1);
  prismaMock.financialRequest.update.mockResolvedValue({});
  prismaMock.financialRequest.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.financialAttachment.createMany.mockResolvedValue({ count: 1 });
  prismaMock.church.findUnique.mockResolvedValue({ accountingEmails: null });
  prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "compta-1" }]);
});

describe("requestPiece", () => {
  it("pose l'état, journalise et notifie le demandeur", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request());
    await requestPiece("req-1", compta, "  La facture  ", NOW);
    expect(prismaMock.financialRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { pieceRequestedAt: NOW, pieceRequestLastAt: NOW, pieceRequestCount: { increment: 1 }, pieceRequestNote: "La facture" },
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "FinancialRequest", details: { pieceRequest: "request", note: "La facture" } }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", domain: "accounting", type: "ACCOUNTING_PIECE_REQUESTED", link: "/accounting/requests/req-1" })
    );
  });

  it("une relance garde la date initiale et se journalise comme relance", async () => {
    const first = new Date("2026-11-20T10:00:00Z");
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ pieceRequestedAt: first, pieceRequestCount: 1 }));
    await requestPiece("req-1", compta, undefined, NOW);
    expect(prismaMock.financialRequest.update.mock.calls[0][0].data.pieceRequestedAt).toBe(first);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: { pieceRequest: "reminder", note: null } }));
  });

  it.each(["CANCELLED", "REJECTED"])("refuse une demande %s", async (status) => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ status }));
    expect((await rejection(requestPiece("req-1", compta))).statusCode).toBe(400);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("refuse si le demandeur n'est plus membre de l'église", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request());
    prismaMock.userChurchRole.count.mockResolvedValue(0);
    expect((await rejection(requestPiece("req-1", compta))).statusCode).toBe(400);
  });
});

describe("cancelPieceRequest", () => {
  it("remet l'état à zéro", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ pieceRequestedAt: NOW, pieceRequestCount: 2 }));
    await cancelPieceRequest("req-1", compta);
    expect(prismaMock.financialRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { pieceRequestedAt: null, pieceRequestLastAt: null, pieceRequestCount: 0, pieceRequestNote: null },
    });
  });

  it("refuse sans demande en cours", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request());
    expect((await rejection(cancelPieceRequest("req-1", compta))).statusCode).toBe(400);
  });
});

describe("submitPieces", () => {
  beforeEach(() => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ pieceRequestedAt: NOW, pieceRequestCount: 1 }));
  });

  it("stocke le lot, referme l'état et prévient la compta une fois", async () => {
    const res = await submitPieces("req-1", demandeur, [pdf("a.pdf"), pdf("b.pdf")]);
    expect(res.count).toBe(2);
    expect(storeFile).toHaveBeenCalledTimes(2);
    expect(prismaMock.financialAttachment.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(prismaMock.financialRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", pieceRequestedAt: { not: null } },
      data: { pieceRequestedAt: null, pieceRequestLastAt: null, pieceRequestCount: 0, pieceRequestNote: null },
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toEqual(["compta-1"]);
    expect(notifyUsers.mock.calls[0][1]).toMatchObject({ type: "ACCOUNTING_PIECE_SUBMITTED" });
  });

  it("refuse un autre compte que le demandeur", async () => {
    expect((await rejection(submitPieces("req-1", { id: "other", name: "X" }, [pdf()]))).statusCode).toBe(403);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("refuse sans pièce demandée, ou sur une demande rejetée", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request());
    expect((await rejection(submitPieces("req-1", demandeur, [pdf()]))).statusCode).toBe(400);
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ pieceRequestedAt: NOW, status: "REJECTED" }));
    expect((await rejection(submitPieces("req-1", demandeur, [pdf()]))).statusCode).toBe(400);
  });

  it("refuse un format ou une taille hors règle avant tout stockage", async () => {
    expect((await rejection(submitPieces("req-1", demandeur, [pdf("a.gif", "image/gif")]))).statusCode).toBe(400);
    expect((await rejection(submitPieces("req-1", demandeur, [pdf("a.pdf", "application/pdf", 5 * 1024 * 1024 + 1)]))).statusCode).toBe(400);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("un double envoi (prise perdue) ne notifie pas et supprime les fichiers stockés", async () => {
    prismaMock.financialRequest.updateMany.mockResolvedValue({ count: 0 });
    expect((await rejection(submitPieces("req-1", demandeur, [pdf("a.pdf"), pdf("b.pdf")]))).statusCode).toBe(400);
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("supprime les fichiers déjà écrits si un stockage échoue", async () => {
    storeFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disque"));
    await rejection(submitPieces("req-1", demandeur, [pdf("a.pdf"), pdf("b.pdf")]));
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(prismaMock.financialAttachment.createMany).not.toHaveBeenCalled();
  });
});
