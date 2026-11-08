/**
 * Tests — spec 078 : justificatifs après la remise des fonds (Prisma mocké).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
const createNotification = vi.fn();
const notifyUsers = vi.fn();
const notifyUsersWithRole = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification, notifyUsers, notifyUsersWithRole }));

const svc = await import("../justifications");

const PAID = new Date("2026-03-02T10:00:00Z");

function request(p: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    seriesId: null,
    type: "BUDGET_ADVANCE",
    label: "Fournitures",
    submittedById: "user-1",
    justificationId: null,
    overageOfJustificationId: null,
    department: { function: null },
    payments: [{ amount: 300, releasedAt: PAID, releasedAmount: 300 }],
    _count: { attachments: 0 },
    shuttleReimbursedEntry: null,
    shuttleImportedEntry: null,
    ...p,
  };
}

function row(p: Record<string, unknown> = {}) {
  return {
    id: "j-1",
    churchId: "church-1",
    seriesId: null,
    period: null,
    status: "AWAITING",
    releasedAmount: 300,
    releasedMonth: "2026-03",
    spentAmount: null,
    dueAt: new Date("2026-03-09T10:00:00Z"),
    nextReminderAt: new Date("2026-03-09T10:00:00Z"),
    reminderCount: 0,
    submittedAt: null,
    rejectionReason: null,
    waiverReason: null,
    decidedById: null,
    decidedAt: null,
    returnedAmount: null,
    returnedAt: null,
    returnedById: null,
    returnTreasuryAccountId: null,
    requests: [
      {
        id: "req-1",
        label: "Fournitures",
        type: "BUDGET_ADVANCE",
        amount: 300,
        submittedById: "user-1",
        departmentId: "dept-1",
        occurrenceNumber: null,
        department: { name: "Accueil" },
        submittedBy: { name: "Léa", email: "lea@example.org" },
      },
    ],
    attachments: [],
    overages: [],
    returnTreasuryAccount: null,
    ...p,
  };
}

const submitter = { userId: "user-1", churchId: "church-1", manage: false, scope: [] as string[] | null };
const accountant = { userId: "compta", churchId: "church-1", manage: true, scope: null };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.financialJustificationSettings.findUnique.mockResolvedValue(null);
});

describe("openJustificationIfDue", () => {
  it("n'ouvre rien tant qu'une tranche reste à verser", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(
      request({ payments: [{ amount: 200, releasedAt: PAID, releasedAmount: 200 }, { amount: 100, releasedAt: null, releasedAmount: null }] })
    );
    expect(await svc.openJustificationIfDue("req-1", prismaMock as never)).toBeNull();
    expect(prismaMock.financialJustification.create).not.toHaveBeenCalled();
  });

  it("ouvre au dernier versement, échéance à 7 jours par défaut", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request());
    prismaMock.financialJustification.create.mockResolvedValue({ id: "j-new" });
    const opened = await svc.openJustificationIfDue("req-1", prismaMock as never);
    expect(opened).toMatchObject({ id: "j-new", submittedById: "user-1", dueAt: new Date("2026-03-09T10:00:00Z") });
    expect(prismaMock.financialJustification.create.mock.calls[0][0].data).toMatchObject({ releasedAmount: 300, releasedMonth: "2026-03", period: null });
  });

  it("n'ouvre rien pour la navette, une note issue de la navette, une note liée ou une note avec pièce", async () => {
    for (const p of [
      { department: { function: "NAVETTE" } },
      { type: "EXPENSE_REPORT", shuttleImportedEntry: { id: "e" } },
      { type: "EXPENSE_REPORT", overageOfJustificationId: "j-0" },
      { type: "EXPENSE_REPORT", _count: { attachments: 1 } },
    ]) {
      prismaMock.financialRequest.findUnique.mockResolvedValue(request(p));
      expect(await svc.openJustificationIfDue("req-1", prismaMock as never)).toBeNull();
    }
    expect(prismaMock.financialJustification.create).not.toHaveBeenCalled();
  });

  it("une occurrence de série rejoint la justification du même mois et cumule le versé", async () => {
    prismaMock.financialRequest.findUnique.mockResolvedValue(request({ id: "req-2", seriesId: "s-1" }));
    prismaMock.financialJustification.findFirst.mockResolvedValue(row({ seriesId: "s-1", period: "2026-03", dueAt: new Date("2026-03-05T00:00:00Z") }));
    const opened = await svc.openJustificationIfDue("req-2", prismaMock as never);
    expect(opened?.id).toBe("j-1");
    const data = prismaMock.financialJustification.update.mock.calls[0][0].data;
    expect(data.releasedAmount).toBe(600);
    expect(data.dueAt).toEqual(new Date("2026-03-09T10:00:00Z"));
    expect(data.requests).toEqual({ connect: { id: "req-2" } });
  });
});

describe("gestes", () => {
  it("refuse le dépôt par un autre que le demandeur", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row());
    await expect(svc.submitJustification("j-1", { ...submitter, userId: "other", scope: null }, { spentAmount: 100, attachmentIds: ["a"] })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("dépôt du demandeur : pièces rattachées, compta prévenue, audit", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row());
    prismaMock.financialAttachment.count.mockResolvedValue(1);
    await svc.submitJustification("j-1", submitter, { spentAmount: 268.4, attachmentIds: ["a"] });
    expect(prismaMock.financialAttachment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } }, data: { justificationId: "j-1" } });
    expect(prismaMock.financialJustification.update.mock.calls[0][0].data).toMatchObject({ status: "SUBMITTED", spentAmount: 268.4 });
    expect(notifyUsersWithRole).toHaveBeenCalledWith("church-1", "ACCOUNTANT", expect.objectContaining({ type: "ACCOUNTING_JUSTIFICATION_SUBMITTED" }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "FinancialJustification", entityId: "j-1" }));
  });

  it("refuse un dépôt sans facture", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row());
    await expect(svc.submitJustification("j-1", submitter, { spentAmount: 100, attachmentIds: [] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("acceptation avec reliquat → à rendre ; sans reliquat → soldée", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "SUBMITTED", spentAmount: 268.4 }));
    await svc.reviewJustification("j-1", accountant, { accept: true });
    expect(prismaMock.financialJustification.update.mock.calls[0][0].data.status).toBe("RETURN_DUE");
    expect(createNotification.mock.calls[0][0].message).toContain("reliquat");

    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "SUBMITTED", spentAmount: 350 }));
    await svc.reviewJustification("j-1", accountant, { accept: true });
    expect(prismaMock.financialJustification.update.mock.calls[1][0].data.status).toBe("SETTLED");
  });

  it("refus : motif obligatoire, puis retour à « attendus » avec le motif", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "SUBMITTED", spentAmount: 300 }));
    await expect(svc.reviewJustification("j-1", accountant, { accept: false, reason: " " })).rejects.toMatchObject({ statusCode: 400 });
    await svc.reviewJustification("j-1", accountant, { accept: false, reason: "Facture illisible" });
    expect(prismaMock.financialJustification.update.mock.calls[0][0].data).toMatchObject({ status: "AWAITING", rejectionReason: "Facture illisible" });
  });

  it("seule la compta décide", async () => {
    await expect(svc.reviewJustification("j-1", submitter, { accept: true })).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.waiveJustification("j-1", submitter, { reason: "x", retainedAmount: 1 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.recordReturn("j-1", submitter, { returnedAt: PAID, treasuryAccountId: null })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("dispense : motif et montant retenu, jamais au-delà du versé", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row());
    await expect(svc.waiveJustification("j-1", accountant, { reason: "Perdue", retainedAmount: 400 })).rejects.toMatchObject({ statusCode: 400 });
    await svc.waiveJustification("j-1", accountant, { reason: "Perdue", retainedAmount: 300 });
    expect(prismaMock.financialJustification.update.mock.calls[0][0].data).toMatchObject({ status: "SETTLED", spentAmount: 300, waiverReason: "Perdue" });
  });

  it("restitution avec ou sans compte de trésorerie", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "RETURN_DUE", spentAmount: 268.4 }));
    await svc.recordReturn("j-1", accountant, { returnedAt: PAID, treasuryAccountId: "caisse" });
    expect(prismaMock.financialJustification.update.mock.calls[0][0].data).toMatchObject({ status: "SETTLED", returnedAmount: 31.6, returnTreasuryAccountId: "caisse" });
    await svc.recordReturn("j-1", accountant, { returnedAt: PAID, treasuryAccountId: null });
    expect(prismaMock.financialJustification.update.mock.calls[1][0].data.returnTreasuryAccountId).toBeNull();
  });

  it("une justification d'une autre église répond 404", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ churchId: "church-2" }));
    await expect(svc.getJustification("j-1", accountant)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hors périmètre : 404", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row());
    await expect(svc.getJustification("j-1", { userId: "head", churchId: "church-1", manage: false, scope: ["dept-9"] })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("runJustificationReminders", () => {
  const now = new Date("2026-03-10T08:00:00Z");

  it("relance le demandeur une seule fois par échéance", async () => {
    prismaMock.financialJustification.findMany.mockResolvedValue([row()]);
    prismaMock.financialJustification.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
    expect(await svc.runJustificationReminders(now)).toEqual({ sent: 1, escalated: 0 });
    expect(await svc.runJustificationReminders(now)).toEqual({ sent: 0, escalated: 0 });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(prismaMock.financialJustification.updateMany.mock.calls[0][0].where).toMatchObject({ id: "j-1", status: "AWAITING" });
  });

  it("dès la 3e relance, prévient responsables et Ministre (pas le demandeur deux fois)", async () => {
    prismaMock.financialJustification.findMany.mockResolvedValue([row({ reminderCount: 2 })]);
    prismaMock.financialJustification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
    prismaMock.department.findUnique.mockResolvedValue({ ministryId: "min-1" });
    prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "head" } }, { userChurchRole: { userId: "user-1" } }]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "minister" }]);
    expect(await svc.runJustificationReminders(now)).toEqual({ sent: 1, escalated: 1 });
    expect(notifyUsers.mock.calls[1][0]).toEqual(["head", "minister"]);
    expect(notifyUsers.mock.calls[1][1].type).toBe("ACCOUNTING_JUSTIFICATION_ESCALATION");
  });

  it("n'écrit pas à un demandeur sans rôle dans l'église", async () => {
    prismaMock.financialJustification.findMany.mockResolvedValue([row()]);
    prismaMock.financialJustification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    expect(await svc.runJustificationReminders(now)).toEqual({ sent: 0, escalated: 0 });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("relance aussi un reliquat non rendu", async () => {
    prismaMock.financialJustification.findMany.mockResolvedValue([row({ status: "RETURN_DUE", spentAmount: 268.4 })]);
    prismaMock.financialJustification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
    await svc.runJustificationReminders(now);
    expect(notifyUsers.mock.calls[0][1].message).toContain("reliquat");
  });
});

describe("assertOverageAllowed", () => {
  it("refuse un complément sans dépassement, ou demandé par un autre", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "SETTLED", spentAmount: 300 }));
    await expect(svc.assertOverageAllowed("j-1", submitter)).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.financialJustification.findUnique.mockResolvedValue(row({ status: "SETTLED", spentAmount: 350 }));
    await expect(svc.assertOverageAllowed("j-1", { ...submitter, userId: "other", scope: null })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("le reste à demander déduit les compléments déjà demandés", async () => {
    prismaMock.financialJustification.findUnique.mockResolvedValue(
      row({ status: "SETTLED", spentAmount: 350, overages: [{ id: "o", label: "x", amount: 20, status: "SUBMITTED" }, { id: "p", label: "y", amount: 30, status: "REJECTED" }] })
    );
    expect((await svc.assertOverageAllowed("j-1", submitter)).remaining).toBe(30);
  });
});
