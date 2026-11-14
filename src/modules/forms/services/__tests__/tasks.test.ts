import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a), createNotification: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const { purgeDate, runFormPurge, closeEndedForms } = await import("../tasks");
const { signalNewResponses } = await import("../notify");

beforeEach(() => vi.clearAllMocks());

describe("conservation", () => {
  it("12 mois par défaut, 24 au plus, à compter de la clôture", () => {
    const closed = new Date("2026-01-15T10:00:00Z");
    expect(purgeDate(closed, 12).toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(purgeDate(closed, 36).toISOString()).toBe("2028-01-15T10:00:00.000Z");
  });

  it("purge : totaux calculés puis réponses effacées, seulement à échéance", async () => {
    const now = new Date("2027-02-01T00:00:00Z");
    prismaMock.form.findMany.mockResolvedValue([
      { id: "due", closedAt: new Date("2026-01-15T00:00:00Z"), retentionMonths: 12 },
      { id: "later", closedAt: new Date("2026-06-01T00:00:00Z"), retentionMonths: 12 },
    ]);
    prismaMock.formResponse.groupBy
      .mockResolvedValueOnce([
        { status: "CONFIRMED", _count: { _all: 40 } },
        { status: "CANCELLED", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([{ levelId: "l1", _count: { _all: 12 } }]);
    prismaMock.formLevel.findMany.mockResolvedValue([{ id: "l1", code: "002", session: { label: "Novembre" } }]);
    prismaMock.formResponseChoice.groupBy.mockResolvedValue([{ choiceId: "a", _count: { _all: 20 } }]);
    prismaMock.formChoice.findMany.mockResolvedValue([{ id: "a", label: "001", question: { label: "Niveau" } }]);
    expect(await runFormPurge(now)).toBe(1);
    expect(prismaMock.formResponse.deleteMany).toHaveBeenCalledWith({ where: { formId: "due" } });
    expect(prismaMock.formAnonymousReceipt.deleteMany).toHaveBeenCalledWith({ where: { formId: "due" } });
    expect(prismaMock.form.update).toHaveBeenCalledWith({
      where: { id: "due" },
      data: {
        purgedAt: now,
        totals: {
          responses: 43,
          byStatus: { CONFIRMED: 40, CANCELLED: 3 },
          byChoice: [{ question: "Niveau", choice: "001", count: 20 }],
          byLevel: [{ session: "Novembre", level: "002", count: 12 }],
        },
      },
    });
    expect(prismaMock.formResponse.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("clôture automatique : à la fin des réponses, ou le lendemain de la dernière session", async () => {
    const now = new Date("2026-11-16T08:00:00Z");
    prismaMock.form.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    prismaMock.form.findMany.mockResolvedValue([
      // Samedi 14 et dimanche 15 : close le lundi 16 à 0 h.
      { id: "fini", sessions: [{ startDate: new Date("2026-11-14T00:00:00Z"), days: 2 }] },
      // Dernière session le 16 : l'appel continue toute la journée.
      { id: "en-cours", sessions: [{ startDate: new Date("2026-11-07T00:00:00Z"), days: 1 }, { startDate: new Date("2026-11-16T00:00:00Z"), days: 1 }] },
    ]);
    expect(await closeEndedForms(now)).toBe(3);
    expect(prismaMock.form.updateMany).toHaveBeenNthCalledWith(1, {
      where: { status: "PUBLISHED", deletedAt: null, closesAt: { lte: now }, sessions: { none: {} } },
      data: { status: "CLOSED", closedAt: now },
    });
    expect(prismaMock.form.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["fini"] }, status: "PUBLISHED" },
      data: { status: "CLOSED", closedAt: now },
    });
  });
});

describe("signal regroupé au secrétariat", () => {
  it("nombre de nouvelles réponses, sans nom, pris une seule fois", async () => {
    prismaMock.form.findMany.mockResolvedValue([
      { id: "f1", churchId: "c1", title: "PCNC — novembre", createdById: "u9", notifiedCount: 4, _count: { responses: 7 } },
      { id: "f2", churchId: "c1", title: "Sondage", createdById: "u9", notifiedCount: 2, _count: { responses: 2 } },
    ]);
    prismaMock.form.updateMany.mockResolvedValue({ count: 1 });
    expect(await signalNewResponses()).toBe(3);
    expect(prismaMock.form.updateMany).toHaveBeenCalledWith({ where: { id: "f1", notifiedCount: 4 }, data: { notifiedCount: 7 } });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers).toHaveBeenCalledWith(["u9"], expect.objectContaining({ domain: "forms", title: "PCNC — novembre", message: "3 nouvelles réponses" }));
  });

  it("déjà pris par un autre passage : rien n'est envoyé ; sans auteur : Admins et Secrétaires", async () => {
    prismaMock.form.findMany.mockResolvedValue([{ id: "f1", churchId: "c1", title: "T", createdById: null, notifiedCount: 0, _count: { responses: 1 } }]);
    prismaMock.form.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await signalNewResponses()).toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
    prismaMock.form.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "a1" }, { userId: "s1" }, { userId: "a1" }]);
    await signalNewResponses();
    expect(notifyUsers).toHaveBeenCalledWith(["a1", "s1"], expect.objectContaining({ message: "1 nouvelle réponse" }));
  });
});
