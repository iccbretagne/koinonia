import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { isRequestArchived, isRequestClosed, needsAccountingAction, setRequestArchived } = await import("../archive");

/** Archives de la file de la comptabilité (spec 089). */
const paid = { releasedAt: new Date("2026-11-22") };
const base = { status: "APPROVED", archivedAt: null, pieceRequestedAt: null, payments: [paid], justification: null };

describe("archiveState", () => {
  it("archive d'office une demande validée, tout remis, rien à justifier", () => {
    expect(isRequestClosed(base)).toBe(true);
    expect(isRequestArchived(base)).toBe(true);
    expect(isRequestArchived({ ...base, justification: { status: "SETTLED" } })).toBe(true);
  });

  it("garde dans la file une demande avec une tranche à remettre, une pièce demandée ou des justificatifs ouverts", () => {
    expect(isRequestArchived({ ...base, payments: [paid, { releasedAt: null }] })).toBe(false);
    expect(isRequestArchived({ ...base, pieceRequestedAt: new Date() })).toBe(false);
    expect(isRequestArchived({ ...base, justification: { status: "AWAITING" } })).toBe(false);
    expect(isRequestArchived({ ...base, status: "PROCESSING", payments: [] })).toBe(false);
  });

  it("archivée à la main : hors de la file, sauf si la compta a une action à faire", () => {
    const manual = { ...base, archivedAt: new Date(), justification: { status: "AWAITING" } };
    expect(isRequestArchived(manual)).toBe(true);
    expect(isRequestArchived({ ...manual, justification: { status: "SUBMITTED" } })).toBe(false);
    expect(isRequestArchived({ ...manual, justification: { status: "RETURN_DUE" } })).toBe(false);
    expect(isRequestArchived({ ...manual, payments: [{ releasedAt: null }] })).toBe(false);
    expect(isRequestArchived({ ...base, status: "REJECTED", payments: [], archivedAt: new Date() })).toBe(true);
    expect(needsAccountingAction({ ...base, status: "SUBMITTED", archivedAt: new Date() })).toBe(true);
  });

  it("une demande rejetée non archivée à la main reste visible sous son filtre", () => {
    expect(isRequestArchived({ ...base, status: "REJECTED", payments: [] })).toBe(false);
  });
});

describe("setRequestArchived", () => {
  const actor = { id: "compta-1", churchId: "church-1" };
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.financialRequest.update.mockResolvedValue({ id: "r1" });
  });

  it("archive une demande validée et le journalise", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-1", status: "APPROVED", archivedAt: null });
    await setRequestArchived("r1", true, actor);
    expect(prismaMock.financialRequest.update.mock.calls[0][0].data).toMatchObject({ archivedById: "compta-1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "r1", details: { action: "archive" } }));
  });

  it("désarchive", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-1", status: "APPROVED", archivedAt: new Date() });
    await setRequestArchived("r1", false, actor);
    expect(prismaMock.financialRequest.update.mock.calls[0][0].data).toEqual({ archivedAt: null, archivedById: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: { action: "unarchive" } }));
  });

  it("refuse une demande à traiter (400) ou d'une autre église (404)", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-1", status: "PROCESSING", archivedAt: null });
    await expect(setRequestArchived("r1", true, actor)).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.financialRequest.findUnique.mockResolvedValue({ churchId: "church-2", status: "APPROVED", archivedAt: null });
    await expect(setRequestArchived("r1", true, actor)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.financialRequest.update).not.toHaveBeenCalled();
  });
});
