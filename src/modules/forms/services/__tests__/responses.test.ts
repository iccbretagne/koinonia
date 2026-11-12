import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
process.env.FORMS_TOKEN_SECRET = "secret-de-test";

const { submitResponse, updateOwnResponse, cancelResponse, findResponseByToken, manageTokenOf } = await import("../responses");
const { anonymousReceiptKey } = await import("../tokens");

const NOW = new Date("2026-11-20T14:37:12Z");
const question = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  formId: "f1",
  position: Number(id.slice(1)),
  type,
  label: id.toUpperCase(),
  help: null,
  required: true,
  config: null,
  conditionQuestionId: null,
  conditionValue: null,
  choices: [],
  ...extra,
});
const ATELIER = question("q1", "SINGLE_CHOICE", {
  choices: [
    { id: "a", questionId: "q1", position: 0, label: "Atelier A", capacity: 2 },
    { id: "b", questionId: "q1", position: 1, label: "Atelier B", capacity: null },
  ],
});
const EMAIL = question("q2", "EMAIL");
const FORM = {
  id: "f1",
  churchId: "c1",
  kind: "PARTICIPATION",
  access: "PUBLIC",
  anonymous: false,
  status: "PUBLISHED",
  deletedAt: null,
  opensAt: null,
  closesAt: null,
  maxResponses: null,
  waitlistEnabled: false,
  questions: [ATELIER, EMAIL],
};
const member = { userId: "u1", email: "marie@exemple.fr" };

function form(over: Record<string, unknown> = {}) {
  prismaMock.form.update.mockResolvedValue({ ...FORM, ...over });
}
const created = () => prismaMock.formResponse.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  form();
  prismaMock.formResponse.count.mockResolvedValue(0);
  prismaMock.formResponse.findFirst.mockResolvedValue(null);
  prismaMock.formResponseChoice.groupBy.mockResolvedValue([]);
  prismaMock.formAnonymousReceipt.findUnique.mockResolvedValue(null);
});

describe("envoi d'une réponse", () => {
  it("verrouille le formulaire, enregistre réponses et choix, jeton de gestion sans compte", async () => {
    const result = await submitResponse("f1", { q1: "a", q2: "Marie@Exemple.fr" }, null, NOW);
    expect(prismaMock.form.update.mock.calls[0][0]).toMatchObject({ where: { id: "f1" }, data: { updatedAt: expect.any(Date) } });
    expect(result).toMatchObject({ kind: "created", status: "CONFIRMED", contactEmail: "marie@exemple.fr", userId: null });
    expect(result.kind === "created" && result.manageToken).toMatch(/^[0-9a-f]{64}$/);
    expect(created()).toMatchObject({ formId: "f1", churchId: "c1", userId: null, contactEmail: "marie@exemple.fr", createdAt: NOW });
    expect(created().manageHash).not.toBe(result.kind === "created" ? result.manageToken : "");
    expect(prismaMock.formResponseChoice.createMany).toHaveBeenCalledWith({ data: [{ responseId: created().id, choiceId: "a" }] });
  });

  it("dernière place : prise par une seule réponse ; la suivante est refusée, ou en liste d'attente", async () => {
    prismaMock.formResponseChoice.groupBy.mockResolvedValue([{ choiceId: "a", _count: { _all: 2 } }]);
    await expect(submitResponse("f1", { q1: "a", q2: "x@y.fr" }, null, NOW)).rejects.toThrow("« Atelier A » : complet");
    expect(prismaMock.formResponse.create).not.toHaveBeenCalled();
    form({ waitlistEnabled: true });
    const result = await submitResponse("f1", { q1: "a", q2: "x@y.fr" }, null, NOW);
    expect(result).toMatchObject({ status: "WAITLISTED" });
    expect(created()).toMatchObject({ status: "WAITLISTED", waitingOn: "a" });
    // Places comptées sur les réponses qui tiennent une place (confirmées, place proposée).
    expect(prismaMock.formResponseChoice.groupBy.mock.calls[0][0].where.response.status).toEqual({ in: ["CONFIRMED", "OFFERED"] });
  });

  it("doublon : même adresse ⇒ lien re-dérivé à renvoyer, rien d'écrit", async () => {
    prismaMock.formResponse.findFirst.mockResolvedValue({ id: "r0", contactEmail: "marie@exemple.fr", manageSalt: "0".repeat(32) });
    const result = await submitResponse("f1", { q1: "b", q2: "MARIE@exemple.fr" }, null, NOW);
    expect(result).toEqual({ kind: "duplicate", responseId: "r0", contactEmail: "marie@exemple.fr", manageToken: manageTokenOf({ id: "r0", manageSalt: "0".repeat(32) }) });
    expect(prismaMock.formResponse.create).not.toHaveBeenCalled();
  });

  it("réservé aux comptes : compte requis, compte enregistré, pas de jeton", async () => {
    form({ access: "MEMBERS", questions: [ATELIER] });
    await expect(submitResponse("f1", { q1: "b" }, null, NOW)).rejects.toThrow("Connectez-vous");
    const result = await submitResponse("f1", { q1: "b" }, member, NOW);
    expect(result).toMatchObject({ kind: "created", userId: "u1", manageToken: null, contactEmail: "marie@exemple.fr" });
    expect(prismaMock.formResponse.findFirst.mock.calls[0][0].where.OR).toContainEqual({ userId: "u1" });
  });

  it("formulaire fermé ou plein entre-temps ⇒ non disponible", async () => {
    form({ closesAt: new Date("2026-11-20T14:00:00Z") });
    await expect(submitResponse("f1", { q1: "a", q2: "x@y.fr" }, null, NOW)).rejects.toThrow("pas disponible");
    form({ maxResponses: 5 });
    prismaMock.formResponse.count.mockResolvedValue(5);
    await expect(submitResponse("f1", { q1: "a", q2: "x@y.fr" }, null, NOW)).rejects.toThrow("pas disponible");
  });
});

describe("sondage anonyme", () => {
  beforeEach(() => form({ kind: "SURVEY", access: "MEMBERS", anonymous: true, questions: [question("q1", "RATING")] }));

  it("aucune identité : ni compte, ni email, ni heure, ni identifiant daté ; reçu séparé", async () => {
    const result = await submitResponse("f1", { q1: 4 }, member, NOW);
    expect(result).toMatchObject({ kind: "created", userId: null, contactEmail: null, manageToken: null });
    const data = created();
    expect(data).toMatchObject({ userId: null, contactEmail: null, contactKey: null, manageSalt: null, manageHash: null });
    expect(data.createdAt).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(data.submittedOn).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(prismaMock.formAnswer.createMany.mock.calls[0][0].data[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const receipt = prismaMock.formAnonymousReceipt.create.mock.calls[0][0].data;
    expect(receipt).toEqual({ formId: "f1", keyHash: anonymousReceiptKey("f1", "u1") });
    expect(JSON.stringify(receipt)).not.toContain("u1");
    expect(JSON.stringify(receipt)).not.toContain(data.id);
  });

  it("un seul envoi par compte", async () => {
    prismaMock.formAnonymousReceipt.findUnique.mockResolvedValue({ formId: "f1", keyHash: "x" });
    await expect(submitResponse("f1", { q1: 4 }, member, NOW)).rejects.toThrow("déjà répondu");
    expect(prismaMock.formResponse.create).not.toHaveBeenCalled();
  });
});

describe("gestion de sa réponse", () => {
  it("modification : un choix devenu complet est refusé, le sien reste", async () => {
    prismaMock.formResponse.findUniqueOrThrow.mockResolvedValue({ id: "r1", formId: "f1", status: "CONFIRMED", contactEmail: "x@y.fr", choices: [{ choiceId: "b" }] });
    prismaMock.formResponseChoice.groupBy.mockResolvedValue([{ choiceId: "a", _count: { _all: 2 } }]);
    await expect(updateOwnResponse("r1", { q1: "a", q2: "x@y.fr" }, NOW)).rejects.toThrow("complet");
    prismaMock.formResponse.update.mockResolvedValue({ id: "r1", status: "CONFIRMED" });
    await updateOwnResponse("r1", { q1: "b", q2: "x@y.fr" }, NOW);
    expect(prismaMock.formAnswer.deleteMany).toHaveBeenCalledWith({ where: { responseId: "r1" } });
    expect(prismaMock.formResponse.update.mock.calls[0][0].data).toMatchObject({ modifiedAt: NOW });
  });

  it("annulation : une fois, et seulement dans son formulaire", async () => {
    prismaMock.formResponse.findUnique.mockResolvedValueOnce({ status: "CONFIRMED", formId: "f2" });
    await expect(cancelResponse("r1", { formId: "f1" })).rejects.toThrow("introuvable");
    prismaMock.formResponse.findUnique.mockResolvedValueOnce({ status: "CANCELLED", formId: "f1" });
    await expect(cancelResponse("r1", { formId: "f1" })).rejects.toThrow("déjà close");
  });

  it("jeton : forme vérifiée avant toute requête, empreinte comparée", async () => {
    expect(await findResponseByToken("pas-un-jeton")).toBeNull();
    expect(prismaMock.formResponse.findUnique).not.toHaveBeenCalled();
    const token = manageTokenOf({ id: "r1", manageSalt: "a".repeat(32) })!;
    const { hashToken } = await import("../tokens");
    prismaMock.formResponse.findUnique.mockResolvedValue({ id: "r1", manageHash: hashToken(token), form: { deletedAt: null } });
    expect(await findResponseByToken(token)).not.toBeNull();
    prismaMock.formResponse.findUnique.mockResolvedValue({ id: "r1", manageHash: hashToken(token), form: { deletedAt: new Date() } });
    expect(await findResponseByToken(token)).toBeNull();
  });
});
