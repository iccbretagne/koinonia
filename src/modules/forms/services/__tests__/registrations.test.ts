import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const createNotification = vi.fn();
const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  notifyUsers: (...a: unknown[]) => notifyUsers(...a),
}));
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), requireChurchPermission: vi.fn() }));
process.env.FORMS_TOKEN_SECRET = "secret-de-test";

const { submitResponse, respondToOffer, expireOffers } = await import("../responses");
const { fillOpenPlaces } = await import("../waitlist");
const { saveAttendance } = await import("../attendance");
const { setFacilitators } = await import("../facilitators");
const { getFormAccess, scopeWhere } = await import("../../auth");

/**
 * Inscriptions à sessions (spec 079, lot 2) : places des niveaux, liste d'attente, intervenants,
 * présence.
 */

const NOW = new Date("2026-11-02T10:00:00Z");
const SESSION = {
  id: "s1",
  formId: "f1",
  position: 0,
  label: "PCNC novembre",
  startDate: new Date("2026-11-14T00:00:00Z"),
  days: 2,
  levels: [
    { id: "l1", sessionId: "s1", position: 0, code: "001", label: null, capacity: 2, isEntry: true },
    { id: "l2", sessionId: "s1", position: 1, code: "002", label: null, capacity: 1, isEntry: false },
  ],
};
const REG = {
  id: "q1",
  formId: "f1",
  position: 1,
  type: "SESSION_LEVEL",
  label: "Session et niveau",
  help: null,
  required: true,
  config: null,
  conditionQuestionId: null,
  conditionValue: null,
  choices: [],
};
const EMAIL = { ...REG, id: "q0", position: 0, type: "EMAIL", label: "Votre email" };
const FORM = {
  id: "f1",
  churchId: "c1",
  kind: "REGISTRATION",
  access: "PUBLIC",
  anonymous: false,
  status: "PUBLISHED",
  deletedAt: null,
  opensAt: null,
  closesAt: null,
  maxResponses: null,
  waitlistEnabled: false,
  offerHoldHours: 48,
  questions: [EMAIL, REG],
  sessions: [SESSION],
};
const form = (over: Record<string, unknown> = {}) => prismaMock.form.update.mockResolvedValue({ ...FORM, ...over });
const created = () => prismaMock.formResponse.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  form();
  prismaMock.formResponse.count.mockResolvedValue(0);
  prismaMock.formResponse.findFirst.mockResolvedValue(null);
  prismaMock.formResponse.findMany.mockResolvedValue([]);
  prismaMock.formResponseChoice.groupBy.mockResolvedValue([]);
  prismaMock.formResponse.groupBy.mockResolvedValue([]);
  prismaMock.form.findUnique.mockResolvedValue(null);
});

describe("places des niveaux", () => {
  it("session et niveau enregistrés ; « niveau précédent suivi » demandé hors niveau d'entrée", async () => {
    await expect(submitResponse("f1", { q0: "a@b.fr", q1: { levelId: "l2" } }, null, NOW)).rejects.toThrow("niveau précédent");
    await submitResponse("f1", { q0: "a@b.fr", q1: { levelId: "l2", previousLevelDone: false } }, null, NOW);
    expect(created()).toMatchObject({ status: "CONFIRMED", sessionId: "s1", levelId: "l2", previousLevelDone: false });
  });

  it("niveau complet : refusé sans liste d'attente, sinon en attente sur ce niveau", async () => {
    prismaMock.formResponse.groupBy.mockResolvedValue([{ levelId: "l1", _count: { _all: 2 } }]);
    await expect(submitResponse("f1", { q0: "a@b.fr", q1: { levelId: "l1" } }, null, NOW)).rejects.toThrow("niveau 001");
    expect(prismaMock.formResponse.create).not.toHaveBeenCalled();
    form({ waitlistEnabled: true });
    const result = await submitResponse("f1", { q0: "a@b.fr", q1: { levelId: "l1" } }, null, NOW);
    expect(result).toMatchObject({ status: "WAITLISTED" });
    expect(created()).toMatchObject({ status: "WAITLISTED", waitingOn: "l1", levelId: "l1" });
    // Décompte sous verrou, sur les places tenues (confirmées ou proposées).
    expect(prismaMock.formResponse.groupBy.mock.calls[0][0].where.status).toEqual({ in: ["CONFIRMED", "OFFERED"] });
  });
});

describe("liste d'attente", () => {
  const publishedForm = { status: "PUBLISHED", deletedAt: null, offerHoldHours: 48, questions: [], sessions: [{ levels: [{ id: "l1", capacity: 2 }] }] };

  it("place libérée : proposée au premier arrivé, tenue 48 h ; les suivants attendent", async () => {
    prismaMock.form.findUnique.mockResolvedValue(publishedForm);
    prismaMock.formResponse.findMany.mockResolvedValue([
      { id: "w1", levelId: "l1", choices: [] },
      { id: "w2", levelId: "l1", choices: [] },
    ]);
    prismaMock.formResponse.groupBy.mockResolvedValue([{ levelId: "l1", _count: { _all: 1 } }]);
    const offered = await fillOpenPlaces(prismaMock as never, "f1", NOW);
    expect(offered).toEqual(["w1"]);
    expect(prismaMock.formResponse.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(prismaMock.formResponse.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.formResponse.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { status: "OFFERED", offerExpiresAt: new Date("2026-11-04T10:00:00Z") },
    });
  });

  it("formulaire clôturé : aucune proposition", async () => {
    prismaMock.form.findUnique.mockResolvedValue({ ...publishedForm, status: "CLOSED" });
    expect(await fillOpenPlaces(prismaMock as never, "f1", NOW)).toEqual([]);
    expect(prismaMock.formResponse.update).not.toHaveBeenCalled();
  });

  it("accepter ⇒ confirmée ; décliner ⇒ la place passe au suivant ; expirée ⇒ refus", async () => {
    prismaMock.formResponse.findUnique.mockResolvedValue({ formId: "f1" });
    const pending = { status: "OFFERED", offerExpiresAt: new Date("2026-11-03T10:00:00Z") };
    prismaMock.formResponse.findUniqueOrThrow.mockResolvedValue(pending);
    prismaMock.formResponse.update.mockResolvedValue({ status: "CONFIRMED" });
    await respondToOffer("r1", true, NOW);
    expect(prismaMock.formResponse.update).toHaveBeenLastCalledWith({ where: { id: "r1" }, data: { status: "CONFIRMED", offerExpiresAt: null, waitingOn: null } });
    expect(prismaMock.form.findUnique).not.toHaveBeenCalled();

    await respondToOffer("r1", false, NOW);
    expect(prismaMock.formResponse.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "DECLINED" });
    expect(prismaMock.form.findUnique).toHaveBeenCalled();

    prismaMock.formResponse.findUniqueOrThrow.mockResolvedValue({ ...pending, offerExpiresAt: new Date("2026-11-02T09:00:00Z") });
    await expect(respondToOffer("r1", true, NOW)).rejects.toThrow("expiré");
    prismaMock.formResponse.findUniqueOrThrow.mockResolvedValue({ status: "CONFIRMED", offerExpiresAt: null });
    await expect(respondToOffer("r1", true, NOW)).rejects.toThrow("Aucune place");
  });

  it("expiration : propositions closes, places proposées aux suivants et prévenus", async () => {
    prismaMock.formResponse.findMany
      .mockResolvedValueOnce([{ formId: "f1" }])
      .mockResolvedValueOnce([{ id: "w2", levelId: "l1", choices: [] }])
      .mockResolvedValueOnce([
        { id: "w2", userId: "u2", contactEmail: null, manageSalt: null, offerExpiresAt: new Date("2026-11-04T10:00:00Z"), form: { title: "PCNC", slug: "pcnc", church: { name: "Église", slug: "eglise" } } },
      ]);
    prismaMock.formResponse.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.form.findUnique.mockResolvedValue(publishedForm);
    expect(await expireOffers(NOW)).toBe(1);
    expect(prismaMock.formResponse.updateMany).toHaveBeenCalledWith({
      where: { formId: "f1", status: "OFFERED", offerExpiresAt: { lte: NOW } },
      data: { status: "EXPIRED", offerExpiresAt: null },
    });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", domain: "forms", type: "FORM_OFFER", link: "/f/eglise/pcnc" }));
  });
});

describe("intervenants", () => {
  const session = (roles: { churchId: string; role: string }[], id = "u5") => ({ user: { id, isSuperAdmin: false, churchRoles: roles } }) as never;

  it("gestion, intervenant borné à son périmètre, rien après la clôture ni hors de l'église", async () => {
    prismaMock.form.findFirst.mockResolvedValue({ churchId: "c1", status: "PUBLISHED" });
    expect(await getFormAccess(session([{ churchId: "c1", role: "SECRETARY" }]), "f1")).toMatchObject({ kind: "manage" });

    prismaMock.formFacilitator.findUnique.mockResolvedValue({ allScope: false, scopes: [{ sessionId: "s1", levelId: "l2" }] });
    const access = await getFormAccess(session([{ churchId: "c1", role: "STAR" }]), "f1");
    expect(access).toMatchObject({ kind: "facilitator", scopes: [{ sessionId: "s1", levelId: "l2" }] });
    expect(scopeWhere(access!)).toEqual({ OR: [{ sessionId: "s1", levelId: "l2" }] });

    expect(await getFormAccess(session([{ churchId: "c2", role: "STAR" }]), "f1")).toBeNull();
    prismaMock.formFacilitator.findUnique.mockResolvedValue(null);
    expect(await getFormAccess(session([{ churchId: "c1", role: "STAR" }]), "f1")).toBeNull();
    prismaMock.formFacilitator.findUnique.mockResolvedValue({ allScope: true, scopes: [] });
    prismaMock.form.findFirst.mockResolvedValue({ churchId: "c1", status: "CLOSED" });
    expect(await getFormAccess(session([{ churchId: "c1", role: "STAR" }]), "f1")).toBeNull();
  });

  it("désignation : comptes de l'église, sessions et niveaux du formulaire", async () => {
    prismaMock.form.findFirst.mockResolvedValue({ title: "PCNC", kind: "REGISTRATION", sessions: [{ id: "s1", levels: [{ id: "l1" }] }] });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "u5" }]);
    prismaMock.formFacilitator.findMany.mockResolvedValue([]);
    await expect(setFacilitators("f1", "c1", [{ userId: "u9", allScope: true, scopes: [] }])).rejects.toThrow("appartenir à l'église");
    await expect(setFacilitators("f1", "c1", [{ userId: "u5", allScope: false, scopes: [{ sessionId: "s1", levelId: "autre" }] }])).rejects.toThrow("inconnu");
    await setFacilitators("f1", "c1", [{ userId: "u5", allScope: false, scopes: [{ sessionId: "s1", levelId: "l1" }] }]);
    expect(prismaMock.formFacilitator.create.mock.calls[0][0].data).toMatchObject({ userId: "u5", allScope: false, scopes: { create: [{ sessionId: "s1", levelId: "l1" }] } });
    expect(notifyUsers).toHaveBeenCalledWith(["u5"], expect.objectContaining({ domain: "forms", type: "FORM_FACILITATOR" }));
  });
});

describe("présence", () => {
  const scope = { OR: [{ sessionId: "s1", levelId: "l2" }] };

  it("deux jours × deux demi-journées ; seules les cases changées sont écrites, avec leur auteur", async () => {
    prismaMock.formSession.findFirst.mockResolvedValue({ days: 2 });
    prismaMock.formResponse.findMany.mockResolvedValue([{ id: "r1", attendance: [{ day: 1, half: "AM", present: true }] }]);
    const changed = await saveAttendance(
      "f1",
      "s1",
      [
        { responseId: "r1", day: 1, half: "AM", present: true },
        { responseId: "r1", day: 2, half: "PM", present: true },
      ],
      scope,
      "u5"
    );
    expect(changed).toEqual([{ responseId: "r1", day: 2, half: "PM", present: true }]);
    expect(prismaMock.formAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.formAttendance.upsert.mock.calls[0][0]).toMatchObject({
      where: { responseId_day_half: { responseId: "r1", day: 2, half: "PM" } },
      update: { present: true, updatedById: "u5" },
    });
    // Le périmètre de l'intervenant borne les inscrits modifiables.
    expect(prismaMock.formResponse.findMany.mock.calls[0][0].where.AND[1]).toEqual(scope);
  });

  it("jour hors session ⇒ 400 ; inscrit hors périmètre ⇒ 404", async () => {
    prismaMock.formSession.findFirst.mockResolvedValue({ days: 1 });
    await expect(saveAttendance("f1", "s1", [{ responseId: "r1", day: 2, half: "AM", present: true }], scope, "u5")).rejects.toThrow("hors de la session");
    prismaMock.formResponse.findMany.mockResolvedValue([]);
    await expect(saveAttendance("f1", "s1", [{ responseId: "r9", day: 1, half: "AM", present: true }], scope, "u5")).rejects.toThrow("introuvable");
  });
});
