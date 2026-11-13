import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { parseAnswers, type ParsedAnswers } from "./engine";
import { ACTIVE_STATUSES, FORM_INCLUDE, HOLDING_STATUSES, contactQuestion, type FormWithQuestions } from "./builder";
import { UNAVAILABLE, acceptsResponses, isFull } from "./lifecycle";
import { anonymousReceiptKey, contactKey, isTokenShape, manageTokenPair, matchesHash, newSalt, hashToken } from "./tokens";

/**
 * Réponses (spec 079). Tout envoi passe par une transaction qui **verrouille la ligne du
 * formulaire** (mise à jour) avant de compter : deux personnes qui visent la dernière place ne
 * peuvent pas l'obtenir toutes les deux. Une réponse anonyme ne porte ni compte, ni email, ni
 * heure, ni identifiant daté (ADR-0030).
 */

type Tx = Prisma.TransactionClient;

export interface Respondent {
  userId: string;
  email: string;
}

const engineQuestions = (form: FormWithQuestions) =>
  form.questions.map((q) => ({ ...q, choices: q.choices.map((c) => ({ id: c.id, label: c.label, capacity: c.capacity })) }));

/** Jour courant (UTC), seul horodatage d'une réponse anonyme. */
const today = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Places tenues par choix (réponses confirmées ou à qui une place est proposée). */
export async function holdingByChoice(formId: string, db: Tx = prisma, excludeResponseId?: string) {
  const rows = await db.formResponseChoice.groupBy({
    by: ["choiceId"],
    where: {
      response: { formId, status: { in: [...HOLDING_STATUSES] }, ...(excludeResponseId ? { id: { not: excludeResponseId } } : {}) },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.choiceId, r._count._all]));
}

/** Places restantes des choix limités, pour la page de réponse. */
export async function remainingPlaces(form: FormWithQuestions) {
  const held = await holdingByChoice(form.id);
  const remaining: Record<string, number> = {};
  for (const q of form.questions) for (const c of q.choices) if (c.capacity != null) remaining[c.id] = Math.max(0, c.capacity - (held.get(c.id) ?? 0));
  return remaining;
}

/** Choix complets parmi ceux retenus. */
function fullChoices(form: FormWithQuestions, choiceIds: string[], held: Map<string, number>) {
  const choices = new Map(form.questions.flatMap((q) => q.choices).map((c) => [c.id, c]));
  return choiceIds.map((id) => choices.get(id)!).filter((c) => c.capacity != null && (held.get(c.id) ?? 0) >= c.capacity);
}

/** Verrou du formulaire pour la durée de la transaction, relu avec ses questions. */
async function lockForm(tx: Tx, formId: string) {
  return tx.form.update({ where: { id: formId }, data: { updatedAt: new Date() }, include: FORM_INCLUDE });
}

function answerRows(parsed: ParsedAnswers, responseId: string, anonymous: boolean) {
  return [...parsed.values.entries()].map(([questionId, value]) => ({
    ...(anonymous ? { id: randomUUID() } : {}),
    responseId,
    questionId,
    value: value as Prisma.InputJsonValue,
  }));
}

/** Adresse de contact d'un formulaire public nominatif (question ajoutée d'office). */
function contactEmailOf(form: FormWithQuestions, parsed: ParsedAnswers): string | null {
  const q = contactQuestion(form.questions);
  const value = q ? parsed.values.get(q.id) : undefined;
  return typeof value === "string" ? value : null;
}

export type SubmitResult =
  | {
      kind: "created";
      responseId: string;
      status: "CONFIRMED" | "WAITLISTED";
      manageToken: string | null;
      contactEmail: string | null;
      userId: string | null;
      values: Map<string, unknown>;
    }
  /** `manageToken` re-dérivé, à renvoyer par email à l'adresse — jamais à l'écran. */
  | { kind: "duplicate"; responseId: string; contactEmail: string | null; manageToken: string | null };

/**
 * Enregistre une réponse. `respondent` : le compte connecté (formulaire réservé, ou public rempli
 * en étant connecté). Doublon : même compte, ou même adresse pour un public nominatif ⇒
 * `duplicate` (l'appelant renvoie le lien de gestion à l'adresse, jamais à l'écran).
 */
export async function submitResponse(
  formId: string,
  raw: Record<string, unknown>,
  respondent: Respondent | null,
  now = new Date()
): Promise<SubmitResult> {
  return prisma.$transaction(async (tx) => {
    const form = await lockForm(tx, formId);
    if (!acceptsResponses(form, now) || (await isFull(form, tx))) throw new ApiError(404, UNAVAILABLE);
    if (form.access === "MEMBERS" && !respondent) throw new ApiError(401, "Connectez-vous pour répondre à ce formulaire");
    const parsed = parseAnswers(engineQuestions(form), raw);

    const anonymous = form.anonymous;
    const userId = anonymous ? null : (respondent?.userId ?? null);
    const contactEmail = anonymous ? null : form.access === "PUBLIC" ? contactEmailOf(form, parsed) : (respondent?.email ?? null);
    const key = !anonymous && contactEmail ? contactKey(form.id, contactEmail) : null;

    // Doublons
    if (anonymous && respondent) {
      const receipt = await tx.formAnonymousReceipt.findUnique({
        where: { formId_keyHash: { formId: form.id, keyHash: anonymousReceiptKey(form.id, respondent.userId) } },
      });
      if (receipt) throw new ApiError(409, "Vous avez déjà répondu à ce sondage");
    } else if (!anonymous) {
      const or: Prisma.FormResponseWhereInput[] = [];
      if (userId) or.push({ userId });
      if (key) or.push({ contactKey: key });
      if (or.length) {
        const existing = await tx.formResponse.findFirst({
          where: { formId: form.id, status: { in: [...ACTIVE_STATUSES] }, OR: or },
          select: { id: true, contactEmail: true, manageSalt: true },
        });
        if (existing) {
          return { kind: "duplicate", responseId: existing.id, contactEmail: existing.contactEmail, manageToken: manageTokenOf(existing) };
        }
      }
    }

    // Places
    const full = fullChoices(form, parsed.choiceIds, await holdingByChoice(form.id, tx));
    let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED";
    let waitingOn: string | null = null;
    if (full.length > 0) {
      if (!form.waitlistEnabled || full.length > 1 || anonymous) {
        throw new ApiError(409, `${full.map((c) => `« ${c.label} »`).join(", ")} : complet. Choisissez une autre option.`);
      }
      status = "WAITLISTED";
      waitingOn = full[0].id;
    }

    const responseId = randomUUID();
    const salt = !anonymous && !userId ? newSalt() : null;
    const pair = salt ? manageTokenPair(responseId, salt) : null;
    await tx.formResponse.create({
      data: {
        id: responseId,
        formId: form.id,
        churchId: form.churchId,
        status,
        userId,
        contactEmail,
        contactKey: key,
        waitingOn,
        manageSalt: salt,
        manageHash: pair?.hash ?? null,
        submittedOn: today(now),
        createdAt: anonymous ? today(now) : now,
      },
    });
    const rows = answerRows(parsed, responseId, anonymous);
    if (rows.length) await tx.formAnswer.createMany({ data: rows });
    if (parsed.choiceIds.length) {
      await tx.formResponseChoice.createMany({ data: [...new Set(parsed.choiceIds)].map((choiceId) => ({ responseId, choiceId })) });
    }
    if (anonymous && respondent) {
      await tx.formAnonymousReceipt.create({ data: { formId: form.id, keyHash: anonymousReceiptKey(form.id, respondent.userId) } });
    }
    return { kind: "created", responseId, status, manageToken: pair?.token ?? null, contactEmail, userId, values: parsed.values };
  });
}

const RESPONSE_INCLUDE = {
  answers: true,
  form: { include: { ...FORM_INCLUDE, church: { select: { id: true, name: true, slug: true } } } },
} as const satisfies Prisma.FormResponseInclude;

export type ResponseWithForm = Prisma.FormResponseGetPayload<{ include: typeof RESPONSE_INCLUDE }>;

/** Réponse gérée par son jeton (formulaire public nominatif) ; null si le jeton ne mène à rien. */
export async function findResponseByToken(token: string): Promise<ResponseWithForm | null> {
  if (!isTokenShape(token)) return null;
  const response = await prisma.formResponse.findUnique({ where: { manageHash: hashToken(token) }, include: RESPONSE_INCLUDE });
  if (!response?.manageHash || !matchesHash(token, response.manageHash) || response.form.deletedAt) return null;
  return response;
}

/** Réponse active d'un compte à un formulaire nominatif. */
export async function findMemberResponse(formId: string, userId: string): Promise<ResponseWithForm | null> {
  return prisma.formResponse.findFirst({
    where: { formId, userId, status: { in: [...ACTIVE_STATUSES] }, form: { deletedAt: null } },
    include: RESPONSE_INCLUDE,
  });
}

/** Lien de gestion re-dérivé (jamais stocké), pour l'accusé ou un renvoi. */
export function manageTokenOf(response: { id: string; manageSalt: string | null }): string | null {
  return response.manageSalt ? manageTokenPair(response.id, response.manageSalt).token : null;
}

const isOpenResponse = (status: string) => (ACTIVE_STATUSES as readonly string[]).includes(status);

/** Modification de sa propre réponse, tant que le formulaire accepte des réponses. */
export async function updateOwnResponse(responseId: string, raw: Record<string, unknown>, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.formResponse.findUniqueOrThrow({ where: { id: responseId }, include: { choices: true } });
    const form = await lockForm(tx, current.formId);
    if (!acceptsResponses(form, now) || form.anonymous || !isOpenResponse(current.status)) {
      throw new ApiError(409, "Cette réponse ne peut plus être modifiée");
    }
    const parsed = parseAnswers(engineQuestions(form), raw);
    const before = new Set(current.choices.map((c) => c.choiceId));
    const added = parsed.choiceIds.filter((id) => !before.has(id));
    const full = fullChoices(form, added, await holdingByChoice(form.id, tx, responseId));
    if (full.length > 0 && current.status !== "WAITLISTED") {
      throw new ApiError(409, `${full.map((c) => `« ${c.label} »`).join(", ")} : complet. Gardez votre choix ou choisissez une autre option.`);
    }
    const email = form.access === "PUBLIC" ? contactEmailOf(form, parsed) : current.contactEmail;
    await tx.formAnswer.deleteMany({ where: { responseId } });
    await tx.formResponseChoice.deleteMany({ where: { responseId } });
    const rows = answerRows(parsed, responseId, false);
    if (rows.length) await tx.formAnswer.createMany({ data: rows });
    if (parsed.choiceIds.length) {
      await tx.formResponseChoice.createMany({ data: [...new Set(parsed.choiceIds)].map((choiceId) => ({ responseId, choiceId })) });
    }
    return tx.formResponse.update({
      where: { id: responseId },
      data: { modifiedAt: now, contactEmail: email, contactKey: email ? contactKey(form.id, email) : null },
    });
  });
}

/** Annulation (par le répondant ou par la gestion). */
export async function cancelResponse(responseId: string, options: { formId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const response = await prisma.formResponse.findUnique({ where: { id: responseId }, select: { status: true, formId: true } });
  if (!response || (options.formId && response.formId !== options.formId)) throw new ApiError(404, "Réponse introuvable");
  if (!isOpenResponse(response.status)) throw new ApiError(409, "Cette réponse est déjà close");
  return prisma.formResponse.update({ where: { id: responseId }, data: { status: "CANCELLED", cancelledAt: now } });
}

/** Réponses d'un formulaire pour la gestion (identité absente d'un sondage anonyme). */
export async function listResponses(formId: string, status?: Prisma.FormResponseWhereInput["status"]) {
  return prisma.formResponse.findMany({
    where: { formId, ...(status ? { status } : {}) },
    include: { answers: true, user: { select: { id: true, name: true, displayName: true, email: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** Réponses ouvertes d'un compte connecté, tous formulaires de ses églises confondus. */
export async function listMemberResponses(userId: string) {
  return prisma.formResponse.findMany({
    where: { userId, status: { in: [...ACTIVE_STATUSES] }, form: { deletedAt: null, status: "PUBLISHED" } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      form: { select: { id: true, title: true, slug: true, closesAt: true, church: { select: { slug: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Ce que la page de réponse montre d'un formulaire : questions, choix et places restantes. */
export async function publicView(form: FormWithQuestions & { church: { name: string; slug: string } }) {
  const remaining = await remainingPlaces(form);
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    kind: form.kind,
    access: form.access,
    anonymous: form.anonymous,
    waitlistEnabled: form.waitlistEnabled,
    closesAt: form.closesAt,
    church: { name: form.church.name, slug: form.church.slug },
    questions: form.questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      label: q.label,
      help: q.help,
      required: q.required,
      config: q.config,
      conditionQuestionId: q.conditionQuestionId,
      conditionValue: q.conditionValue,
      choices: q.choices.map((c) => ({ id: c.id, label: c.label, remaining: c.capacity == null ? null : (remaining[c.id] ?? 0) })),
    })),
  };
}

export type PublicFormView = Awaited<ReturnType<typeof publicView>>;

/** Valeurs d'une réponse, par question (pour préremplir sa modification). */
export const answersRecord = (answers: { questionId: string; value: unknown }[]) =>
  Object.fromEntries(answers.map((a) => [a.questionId, a.value]));

/** Un compte a-t-il déjà répondu à ce sondage anonyme ? (reçu séparé, sans lien vers la réponse) */
export async function hasAnonymousReceipt(formId: string, userId: string): Promise<boolean> {
  const receipt = await prisma.formAnonymousReceipt.findUnique({
    where: { formId_keyHash: { formId, keyHash: anonymousReceiptKey(formId, userId) } },
  });
  return receipt !== null;
}

/**
 * « Retrouver ma réponse » : renvoie le lien de gestion de la réponse active de cette adresse,
 * s'il y en a une. L'appelant répond toujours la même chose, que l'adresse soit connue ou non.
 */
export async function recoverResponseLink(formId: string, email: string): Promise<{ contactEmail: string; manageToken: string } | null> {
  const existing = await prisma.formResponse.findFirst({
    where: { formId, status: { in: [...ACTIVE_STATUSES] }, contactKey: contactKey(formId, email), manageSalt: { not: null } },
    select: { id: true, contactEmail: true, manageSalt: true },
  });
  const manageToken = existing ? manageTokenOf(existing) : null;
  return existing?.contactEmail && manageToken ? { contactEmail: existing.contactEmail, manageToken } : null;
}
