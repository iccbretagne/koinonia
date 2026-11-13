import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { assertSafeEdit, slugify, updateForm, duplicateForm, createForm } = await import("../builder");
const { changeStatus, loadAnswerableForm, acceptsResponses } = await import("../lifecycle");

const choice = (id: string, capacity: number | null = null) => ({ id, questionId: "q1", position: 0, label: id.toUpperCase(), capacity });
const FORM = {
  id: "f1",
  churchId: "c1",
  slug: "pcnc",
  title: "PCNC",
  kind: "REGISTRATION",
  access: "PUBLIC",
  anonymous: false,
  status: "DRAFT",
  deletedAt: null,
  purgedAt: null,
  opensAt: null,
  closesAt: null,
  closedAt: null,
  maxResponses: null,
  questions: [
    { id: "q1", formId: "f1", position: 0, type: "SINGLE_CHOICE", label: "Atelier", help: null, required: true, config: null, conditionQuestionId: null, conditionValue: null, choices: [choice("a", 20), choice("b")] },
    { id: "q2", formId: "f1", position: 1, type: "EMAIL", label: "Email", help: null, required: true, config: null, conditionQuestionId: null, conditionValue: null, choices: [] },
  ],
};
const usage = (over: Partial<{ responses: number; answered: string[]; holding: [string, number][]; used: string[] }> = {}) => ({
  responses: over.responses ?? 0,
  answeredQuestions: new Set(over.answered ?? []),
  holdingByChoice: new Map(over.holding ?? []),
  usedChoices: new Set(over.used ?? []),
});
const asInput = (questions = FORM.questions) =>
  questions.map((q) => ({
    key: q.id,
    type: q.type as "SINGLE_CHOICE",
    label: q.label,
    required: q.required,
    choices: q.choices.length ? q.choices.map((c) => ({ key: c.id, label: c.label, capacity: c.capacity })) : undefined,
  }));

beforeEach(() => vi.clearAllMocks());

describe("adresse", () => {
  it("lisible, sans accent ni ponctuation", () => {
    expect(slugify("PCNC — novembre 2026 !")).toBe("pcnc-novembre-2026");
    expect(slugify("Été à l'église")).toBe("ete-a-l-eglise");
    expect(slugify("!!")).toBe("formulaire");
  });
});

describe("modification d'un formulaire qui a des réponses", () => {
  const form = FORM as never;
  it("sans réponse : tout est permis", () => {
    expect(() => assertSafeEdit(form, { questions: [] }, usage())).not.toThrow();
  });

  it("question répondue : ni supprimée ni changée de type", () => {
    const u = usage({ responses: 3, answered: ["q1"] });
    expect(() => assertSafeEdit(form, { questions: asInput([FORM.questions[1]]) }, u)).toThrow("ne peut pas être supprimée");
    const retyped = asInput().map((q) => (q.key === "q1" ? { ...q, type: "DROPDOWN" as never } : q));
    expect(() => assertSafeEdit(form, { questions: retyped }, u)).toThrow("son type ne peut pas changer");
  });

  it("places : jamais sous les réponses ; choix retenu non supprimable", () => {
    const u = usage({ responses: 12, answered: ["q1"], holding: [["a", 12]], used: ["a"] });
    const lowered = asInput().map((q) => (q.key === "q1" ? { ...q, choices: [{ key: "a", label: "A", capacity: 10 }, { key: "b", label: "B", capacity: null }] } : q));
    expect(() => assertSafeEdit(form, { questions: lowered }, u)).toThrow("ne peuvent pas descendre");
    const raised = asInput().map((q) => (q.key === "q1" ? { ...q, choices: [{ key: "a", label: "A", capacity: 30 }, { key: "b", label: "B", capacity: null }] } : q));
    expect(() => assertSafeEdit(form, { questions: raised }, u)).not.toThrow();
    const removed = asInput().map((q) => (q.key === "q1" ? { ...q, choices: [{ key: "b", label: "B", capacity: null }] } : q));
    expect(() => assertSafeEdit(form, { questions: removed }, u)).toThrow("ce choix ne peut pas être supprimé");
  });

  it("anonymat figé ; ajout d'une question seulement facultative", () => {
    const u = usage({ responses: 1 });
    expect(() => assertSafeEdit(form, { anonymous: true }, u)).toThrow("anonymat");
    expect(() => assertSafeEdit(form, { questions: [...asInput(), { key: "new", type: "SHORT_TEXT" as never, label: "Église", required: true, choices: undefined }] }, u)).toThrow(
      "doit être facultative"
    );
    expect(() => assertSafeEdit(form, { questions: [...asInput(), { key: "new", type: "SHORT_TEXT" as never, label: "Église", required: false, choices: undefined }] }, u)).not.toThrow();
  });
});

describe("création", () => {
  it("public nominatif : la question Email est créée d'office", async () => {
    prismaMock.form.findMany.mockResolvedValue([]);
    prismaMock.form.create.mockResolvedValue({ id: "f9" });
    prismaMock.form.findUniqueOrThrow.mockResolvedValue({ ...FORM, id: "f9", questions: [] });
    await createForm("c1", "u1", { title: "Soirée", kind: "PARTICIPATION", access: "PUBLIC", anonymous: false });
    expect(prismaMock.formQuestion.create.mock.calls[0][0].data).toMatchObject({ formId: "f9", type: "EMAIL", required: true, label: "Votre email" });
  });
});

describe("mise à jour", () => {
  beforeEach(() => {
    prismaMock.form.update.mockResolvedValue(FORM);
    prismaMock.form.findUniqueOrThrow.mockResolvedValue(FORM);
    prismaMock.form.findMany.mockResolvedValue([]);
    prismaMock.formResponse.count.mockResolvedValue(0);
    prismaMock.formAnswer.groupBy.mockResolvedValue([]);
    prismaMock.formResponseChoice.groupBy.mockResolvedValue([]);
    prismaMock.formResponseChoice.findMany.mockResolvedValue([]);
  });

  it("refus : condition sur une question suivante, choix absent, réglage hors nombre, anonymat hors sondage", async () => {
    const after = [
      { key: "x", type: "SHORT_TEXT" as const, label: "X", required: false, condition: { questionKey: "y", value: "true" } },
      { key: "y", type: "YES_NO" as const, label: "Y", required: false },
    ];
    await expect(updateForm("f1", { questions: after })).rejects.toThrow("question précédente");
    await expect(updateForm("f1", { questions: [{ key: "z", type: "SINGLE_CHOICE", label: "Z", required: false, choices: [] }] })).rejects.toThrow("au moins un choix");
    await expect(updateForm("f1", { questions: [{ key: "z", type: "SHORT_TEXT", label: "Z", required: false, config: { min: 1 } }] })).rejects.toThrow("réservé aux nombres");
    await expect(updateForm("f1", { anonymous: true })).rejects.toThrow("Seul un sondage");
    await expect(updateForm("f1", { questions: [{ key: "s", type: "SESSION_LEVEL", label: "S", required: true }] })).rejects.toThrow("inscriptions PCNC");
  });

  it("conditions écrites après les questions, valeur de choix traduite en identifiant", async () => {
    await updateForm("f1", {
      questions: [
        { key: "q1", type: "SINGLE_CHOICE", label: "Atelier", required: true, choices: [{ key: "a", label: "A", capacity: 20 }, { key: "tmp-c", label: "C" }] },
        { key: "tmp-q", type: "SHORT_TEXT", label: "Pourquoi C ?", required: false, condition: { questionKey: "q1", value: "tmp-c" } },
      ],
    });
    expect(prismaMock.formQuestion.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["q2"] } } });
    expect(prismaMock.formChoice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["b"] } } });
    const createdChoice = prismaMock.formChoice.create.mock.calls[0][0].data;
    const conditionCall = prismaMock.formQuestion.update.mock.calls.at(-1)![0];
    expect(conditionCall.data).toEqual({ conditionQuestionId: "q1", conditionValue: createdChoice.id });
  });

  it("adresse déjà prise dans l'église ⇒ 409 ; fin avant ouverture ⇒ 400", async () => {
    prismaMock.form.findMany.mockResolvedValue([{ slug: "inscription" }]);
    await expect(updateForm("f1", { slug: "inscription" })).rejects.toThrow("déjà prise");
    await expect(updateForm("f1", { opensAt: new Date("2026-12-02"), closesAt: new Date("2026-12-01") })).rejects.toThrow("doit suivre");
  });
});

describe("duplication", () => {
  it("brouillon neuf : nouvelles questions, conditions reprises", async () => {
    const source = {
      ...FORM,
      status: "CLOSED",
      questions: [
        FORM.questions[0],
        { ...FORM.questions[1], id: "q3", type: "SHORT_TEXT", conditionQuestionId: "q1", conditionValue: "b", choices: [] },
      ],
    };
    prismaMock.form.findFirst.mockResolvedValue(source);
    prismaMock.form.findMany.mockResolvedValue([{ slug: "pcnc-copie" }]);
    prismaMock.form.create.mockResolvedValue({ ...FORM, id: "f2", questions: [] });
    prismaMock.form.findUniqueOrThrow.mockResolvedValue({ id: "f2" });
    await duplicateForm("f1", "u1");
    const data = prismaMock.form.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: "PCNC (copie)", slug: "pcnc-copie-2", createdById: "u1" });
    expect(data.status).toBeUndefined();
    const created = prismaMock.formQuestion.create.mock.calls.map((c) => (c[0] as { data: { id: string } }).data.id);
    expect(created).not.toContain("q1");
    const choiceB = prismaMock.formChoice.create.mock.calls.map((c) => (c[0] as { data: { id: string; label: string } }).data).find((c) => c.label === "B")!;
    expect(prismaMock.formQuestion.update.mock.calls.at(-1)![0].data).toEqual({ conditionQuestionId: created[0], conditionValue: choiceB.id });
  });
});

describe("cycle de vie", () => {
  it("publication : au moins une vraie question ; l'email d'un public nominatif est ajouté d'office", async () => {
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, questions: [] });
    await expect(changeStatus("f1", "publish")).rejects.toThrow("au moins une question");
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, questions: [FORM.questions[1]] });
    await expect(changeStatus("f1", "publish")).rejects.toThrow("au moins une question");
    // Public nominatif sans question Email : ajoutée en tête, puis publié.
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, questions: [FORM.questions[0]] });
    prismaMock.form.findUniqueOrThrow.mockResolvedValueOnce({ ...FORM, questions: [FORM.questions[0]] });
    await changeStatus("f1", "publish");
    expect(prismaMock.formQuestion.updateMany).toHaveBeenCalledWith({ where: { formId: "f1" }, data: { position: { increment: 1 } } });
    expect(prismaMock.formQuestion.create.mock.calls[0][0].data).toMatchObject({ formId: "f1", position: 0, type: "EMAIL", required: true });
    expect(prismaMock.form.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: "PUBLISHED" } }));
  });

  it("adresse de contact : une question Email existante devient obligatoire ; rien pour un réservé ou un anonyme", async () => {
    const optionalEmail = { ...FORM.questions[1], required: false };
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, questions: [FORM.questions[0], optionalEmail] });
    prismaMock.form.findUniqueOrThrow.mockResolvedValueOnce({ ...FORM, questions: [FORM.questions[0], optionalEmail] });
    await changeStatus("f1", "publish");
    expect(prismaMock.formQuestion.update).toHaveBeenCalledWith({ where: { id: "q2" }, data: { required: true } });
    expect(prismaMock.formQuestion.create).not.toHaveBeenCalled();
    vi.clearAllMocks();
    for (const variant of [{ access: "MEMBERS" }, { kind: "SURVEY", anonymous: true }]) {
      prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, ...variant, questions: [FORM.questions[0]] });
      prismaMock.form.findUniqueOrThrow.mockResolvedValueOnce({ ...FORM, ...variant, questions: [FORM.questions[0]] });
      await changeStatus("f1", "publish");
    }
    expect(prismaMock.formQuestion.create).not.toHaveBeenCalled();
    expect(prismaMock.formQuestion.update).not.toHaveBeenCalled();
  });

  it("clôture puis réouverture ; pas de réouverture après la fin des réponses ni après la purge", async () => {
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, status: "PUBLISHED" });
    await changeStatus("f1", "close");
    expect(prismaMock.form.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "CLOSED" });
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, status: "CLOSED", closesAt: new Date("2020-01-01") });
    await expect(changeStatus("f1", "reopen")).rejects.toThrow("Repoussez");
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, status: "CLOSED", purgedAt: new Date() });
    await expect(changeStatus("f1", "reopen")).rejects.toThrow("effacées");
  });

  it("accepte des réponses : publié, non supprimé, entre ouverture et fin", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const base = { status: "PUBLISHED", deletedAt: null, opensAt: null, closesAt: null };
    expect(acceptsResponses(base, now)).toBe(true);
    expect(acceptsResponses({ ...base, status: "DRAFT" }, now)).toBe(false);
    expect(acceptsResponses({ ...base, opensAt: new Date("2026-11-21") }, now)).toBe(false);
    expect(acceptsResponses({ ...base, closesAt: new Date("2026-11-20T09:00:00Z") }, now)).toBe(false);
    expect(acceptsResponses({ ...base, deletedAt: new Date() }, now)).toBe(false);
  });

  it("non disponible : inexistant, pas ouvert, ou nombre maximal atteint", async () => {
    prismaMock.form.findFirst.mockResolvedValueOnce(null);
    expect(await loadAnswerableForm("rennes", "pcnc")).toBeNull();
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, status: "PUBLISHED", maxResponses: 10 });
    prismaMock.formResponse.count.mockResolvedValueOnce(10);
    expect(await loadAnswerableForm("rennes", "pcnc")).toBeNull();
    prismaMock.form.findFirst.mockResolvedValueOnce({ ...FORM, status: "PUBLISHED", maxResponses: 10 });
    prismaMock.formResponse.count.mockResolvedValueOnce(9);
    expect(await loadAnswerableForm("rennes", "pcnc")).not.toBeNull();
    expect(prismaMock.form.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null, status: "PUBLISHED", church: { slug: "rennes" } });
  });
});
