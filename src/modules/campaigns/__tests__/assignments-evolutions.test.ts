/**
 * Tests — évolutions du niveau questionnaire (spec 091) : rouvrir une contribution soumise,
 * annuler une validation, échéance par contribution, dernier répondant protégé, remplacement d'un
 * répondant, lien personnel consulté par le gestionnaire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const model = () => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
});
const db = {
  campaignAssignment: model(),
  campaignRespondent: model(),
  userChurchRole: model(),
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  $queryRaw: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
const notify = {
  notifyAssignmentSubmitted: vi.fn(),
  notifyChangesRequested: vi.fn(),
  notifyRespondentAdded: vi.fn(),
  notifyAssignmentReopened: vi.fn(),
  ensureRespondentLink: vi.fn(async () => "https://exemple.test/collecte/kc_lien"),
  respondentLink: vi.fn(() => "https://exemple.test/collecte/x"),
};
vi.mock("../services/notify", () => notify);
process.env.CAMPAIGNS_TOKEN_SECRET = "secret-de-test";

const { reviewAssignment, reopenAssignment, unvalidateAssignment, setAssignmentDueAt, removeRespondent, replaceRespondent, getRespondentLink } = await import(
  "../services/assignments"
);
const { dueAtToDate } = await import("../services/values");

let campaignStatus = "OPEN";
const manager = (status = "OPEN") =>
  ({
    role: "manager",
    actor: { kind: "user", userId: "u1", name: "Alice", session: {} },
    assignment: { id: "as1", churchId: "c1", campaignId: "cp1", formId: "f1", status: "SUBMITTED", campaignStatus: status },
  }) as never;
const respondent = () => ({ ...(manager() as object), role: "respondent", respondentId: "r1" }) as never;

const guest = { id: "r1", userId: null, name: "Denis Durand", email: "denis@exemple.org", tokenHash: "h", tokenSalt: "s", createdAt: new Date(), user: null };

beforeEach(() => {
  vi.clearAllMocks();
  campaignStatus = "OPEN";
  db.campaignAssignment.updateMany.mockResolvedValue({ count: 1 });
  db.campaignAssignment.findUnique.mockImplementation(async () => ({ campaign: { status: campaignStatus, dueAt: new Date("2026-12-04T22:59:00Z") }, dueAt: null }));
  db.campaignRespondent.findFirst.mockResolvedValue(guest);
  db.campaignRespondent.findUniqueOrThrow.mockResolvedValue({ ...guest, id: "r9" });
});

describe("rouvrir / annuler la validation", () => {
  it("reopen : soumis → en cours sous condition, campagne ouverte, répondants prévenus, journalisé sans motif", async () => {
    const out = await reviewAssignment(manager(), { action: "reopen", reason: "Chiffre à revoir" });
    expect(out).toEqual({ status: "IN_PROGRESS" });
    const call = db.campaignAssignment.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "as1", status: "SUBMITTED", campaign: { status: "OPEN" } });
    expect(call.data).toMatchObject({ status: "IN_PROGRESS", submittedAt: null, submittedById: null, reviewReason: "Chiffre à revoir", reviewedById: "u1" });
    expect(notify.notifyAssignmentReopened).toHaveBeenCalledWith("as1", "Chiffre à revoir");
    expect(JSON.stringify(logAudit.mock.calls)).not.toContain("Chiffre");
    expect(logAudit.mock.calls[0][0].details).toMatchObject({ status: "IN_PROGRESS", reopened: true, withReason: true });
  });

  it("reopen : campagne non ouverte, ou contribution plus soumise (validée) ⇒ 409, sans notification", async () => {
    await expect(reopenAssignment(manager("CLOSED"))).rejects.toMatchObject({ statusCode: 409 });
    db.campaignAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(reopenAssignment(manager())).rejects.toThrow(/annulez d'abord la validation/);
    expect(notify.notifyAssignmentReopened).not.toHaveBeenCalled();
  });

  it("unvalidate : validé → soumis, mention pastorale retirée, campagne clôturée acceptée, sans notification", async () => {
    const out = await unvalidateAssignment(manager("CLOSED"));
    expect(out).toEqual({ status: "SUBMITTED", pastoralValidated: false });
    const call = db.campaignAssignment.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "as1", status: "VALIDATED" });
    expect(call.data).toMatchObject({ status: "SUBMITTED", validatedAt: null, validatedById: null, pastoralValidated: false });
    expect(notify.notifyAssignmentReopened).not.toHaveBeenCalled();
    db.campaignAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(reviewAssignment(manager(), { action: "unvalidate" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("échéance d'une contribution", () => {
  it("jour ⇒ fin de journée à Paris ; échéance reculée ⇒ relance J-2 réarmée", async () => {
    const out = await setAssignmentDueAt(manager(), "2026-12-11");
    expect(db.campaignAssignment.update).toHaveBeenCalledWith({ where: { id: "as1" }, data: { dueAt: dueAtToDate("2026-12-11"), dueReminderSentAt: null } });
    expect(out.dueAt).toEqual(dueAtToDate("2026-12-11"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "CampaignAssignment", entityId: "as1" }));
  });

  it("échéance avancée : relance non réarmée ; null ⇒ celle de la campagne", async () => {
    await setAssignmentDueAt(manager(), "2026-11-01");
    expect(db.campaignAssignment.update).toHaveBeenLastCalledWith({ where: { id: "as1" }, data: { dueAt: dueAtToDate("2026-11-01") } });
    const out = await setAssignmentDueAt(manager(), null);
    expect(out).toEqual({ assignmentDueAt: null, dueAt: new Date("2026-12-04T22:59:00Z") });
  });
});

describe("répondants", () => {
  it("campagne ouverte : le dernier répondant valide ne se retire pas (sous verrou)", async () => {
    db.campaignRespondent.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(removeRespondent(manager(), "r1")).rejects.toThrow(/dernier répondant.*Remplacer/);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.campaignRespondent.delete).not.toHaveBeenCalled();
  });

  it("un autre répondant valide, un répondant déjà invalide ou une campagne en brouillon : retrait permis", async () => {
    db.campaignRespondent.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await removeRespondent(manager(), "r1");
    db.campaignRespondent.count.mockResolvedValueOnce(0);
    await removeRespondent(manager(), "r1");
    campaignStatus = "DRAFT";
    await removeRespondent(manager("DRAFT"), "r1");
    expect(db.campaignRespondent.delete).toHaveBeenCalledTimes(3);
  });

  it("remplacer : nouveau créé puis ancien retiré, sous verrou ; nouveau prévenu ; journal sans nom ni email", async () => {
    db.userChurchRole.findFirst.mockResolvedValue({ userId: "u2" });
    db.campaignRespondent.findUnique.mockResolvedValue(null);
    db.campaignRespondent.create.mockResolvedValue({ id: "r9" });
    await replaceRespondent(manager(), "r1", { userId: "u2" });
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.campaignRespondent.create.mock.invocationCallOrder[0]).toBeLessThan(db.campaignRespondent.delete.mock.invocationCallOrder[0]);
    expect(db.campaignRespondent.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(notify.notifyRespondentAdded).toHaveBeenCalledWith("r9");
    expect(logAudit.mock.calls[0][0].details).toMatchObject({ replaced: "r1", userId: "u2" });
    expect(JSON.stringify(logAudit.mock.calls)).not.toMatch(/Denis|exemple\.org/);
  });

  it("remplacer par une personne déjà répondante : 409, rien n'est retiré", async () => {
    db.userChurchRole.findFirst.mockResolvedValue({ userId: "u2" });
    db.campaignRespondent.findUnique.mockResolvedValue({ id: "r2" });
    await expect(replaceRespondent(manager(), "r1", { userId: "u2" })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.campaignRespondent.delete).not.toHaveBeenCalled();
  });

  it("voir le lien : sans compte seulement, gestionnaire seulement, journalisé sans le lien", async () => {
    expect(await getRespondentLink(manager(), "r1")).toEqual({ link: "https://exemple.test/collecte/kc_lien" });
    expect(notify.ensureRespondentLink).toHaveBeenCalledWith({ id: "r1", tokenSalt: "s" });
    expect(JSON.stringify(logAudit.mock.calls)).not.toContain("kc_lien");
    db.campaignRespondent.findFirst.mockResolvedValueOnce({ ...guest, userId: "u3" });
    await expect(getRespondentLink(manager(), "r1")).rejects.toMatchObject({ statusCode: 400 });
    await expect(getRespondentLink(respondent(), "r1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
