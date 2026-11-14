import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import {
  CHOICE_TYPES,
  RETENTION_MONTHS,
  type FormUpdateInput,
  type QuestionInput,
  type QuestionType,
  type SessionInput,
} from "../schemas";
import { fillOpenPlaces } from "./waitlist";
import { notifyOffers } from "./notify";

/**
 * Construction d'un formulaire (spec 079) : création, mise à jour des réglages et des questions,
 * duplication. Dès qu'un formulaire a des réponses, la modification est bornée
 * (`assertSafeEdit`) : on corrige des libellés, on ajoute une question facultative, on augmente
 * des places — on ne supprime ni une question répondue, ni un choix retenu, on ne baisse pas des
 * places sous le nombre de réponses, on ne change ni le type d'une question répondue ni
 * l'anonymat.
 */

type Tx = Prisma.TransactionClient;

/** Réponses qui tiennent une place. */
export const HOLDING_STATUSES = ["CONFIRMED", "OFFERED"] as const;
/** Réponses « actives » (comptées pour le nombre maximal et les doublons). */
export const ACTIVE_STATUSES = ["CONFIRMED", "WAITLISTED", "OFFERED"] as const;

export const FORM_INCLUDE = {
  questions: {
    orderBy: { position: "asc" },
    include: { choices: { orderBy: { position: "asc" } } },
  },
  sessions: {
    orderBy: { position: "asc" },
    include: { levels: { orderBy: { position: "asc" } } },
  },
} as const satisfies Prisma.FormInclude;

export type FormWithQuestions = Prisma.FormGetPayload<{ include: typeof FORM_INCLUDE }>;

/** Adresse lisible à partir d'un titre (« PCNC — novembre » → « pcnc-novembre »). */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "formulaire";
}

/** Première adresse libre dans l'église à partir d'une base (`base`, `base-2`, `base-3`…). */
export async function uniqueSlug(churchId: string, base: string, db: Tx = prisma, excludeId?: string): Promise<string> {
  const taken = new Set(
    (
      await db.form.findMany({
        where: { churchId, slug: { startsWith: base }, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { slug: true },
      })
    ).map((f) => f.slug)
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/** Un formulaire public nominatif a besoin d'une adresse de contact. */
export const needsContact = (form: { access: string; anonymous: boolean }) => form.access === "PUBLIC" && !form.anonymous;

/** Question qui sert d'adresse de contact : la première question Email obligatoire, toujours affichée. */
export function contactQuestion<Q extends { type: string; required: boolean; conditionQuestionId: string | null }>(questions: readonly Q[]): Q | undefined {
  return questions.find((q) => q.type === "EMAIL" && q.required && !q.conditionQuestionId);
}

export const CONTACT_QUESTION = {
  label: "Votre email",
  help: "Pour l'accusé de réception et le lien qui permet de retrouver, modifier ou annuler votre réponse.",
} as const;

/**
 * Formulaire public nominatif : garantit une question Email obligatoire, sans que le secrétariat
 * ait à y penser. Une question Email existante et toujours affichée devient obligatoire ; sinon
 * une question est ajoutée en tête.
 */
export async function ensureContactQuestion(tx: Tx, formId: string): Promise<void> {
  const form = await tx.form.findUniqueOrThrow({ where: { id: formId }, include: FORM_INCLUDE });
  if (!needsContact(form) || contactQuestion(form.questions)) return;
  const existing = form.questions.find((q) => q.type === "EMAIL" && !q.conditionQuestionId);
  if (existing) {
    await tx.formQuestion.update({ where: { id: existing.id }, data: { required: true } });
    return;
  }
  await tx.formQuestion.updateMany({ where: { formId }, data: { position: { increment: 1 } } });
  await tx.formQuestion.create({
    data: { id: randomUUID(), formId, position: 0, type: "EMAIL", label: CONTACT_QUESTION.label, help: CONTACT_QUESTION.help, required: true },
  });
}

export const REGISTRATION_QUESTION = { label: "Session et niveau" } as const;

/**
 * Inscription à sessions (lot 2) : garantit la question « Session et niveau », obligatoire,
 * juste après l'adresse de contact. Le secrétariat déclare les sessions, la question suit.
 */
export async function ensureRegistrationQuestion(tx: Tx, formId: string): Promise<void> {
  const form = await tx.form.findUniqueOrThrow({ where: { id: formId }, include: FORM_INCLUDE });
  if (form.kind !== "REGISTRATION") return;
  const existing = form.questions.find((q) => q.type === "SESSION_LEVEL");
  if (form.sessions.length === 0) {
    // Plus de session : la question n'a plus d'objet, tant que personne n'y a répondu.
    if (existing && (await tx.formAnswer.count({ where: { questionId: existing.id } })) === 0) {
      await tx.formQuestion.delete({ where: { id: existing.id } });
    }
    return;
  }
  if (existing) {
    if (!existing.required || existing.conditionQuestionId) {
      await tx.formQuestion.update({ where: { id: existing.id }, data: { required: true, conditionQuestionId: null, conditionValue: null } });
    }
    return;
  }
  const contact = needsContact(form) ? contactQuestion(form.questions) : undefined;
  const position = contact ? contact.position + 1 : 0;
  await tx.formQuestion.updateMany({ where: { formId, position: { gte: position } }, data: { position: { increment: 1 } } });
  await tx.formQuestion.create({
    data: { id: randomUUID(), formId, position, type: "SESSION_LEVEL", label: REGISTRATION_QUESTION.label, required: true },
  });
}

export async function createForm(
  churchId: string,
  userId: string,
  input: { title: string; kind: "REGISTRATION" | "PARTICIPATION" | "SURVEY"; access: "PUBLIC" | "MEMBERS"; anonymous: boolean }
) {
  if (input.anonymous && input.kind !== "SURVEY") throw new ApiError(400, "Seul un sondage peut être anonyme");
  return prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        churchId,
        createdById: userId,
        title: input.title,
        kind: input.kind,
        access: input.access,
        anonymous: input.anonymous,
        slug: await uniqueSlug(churchId, slugify(input.title), tx),
        retentionMonths: RETENTION_MONTHS.default,
      },
    });
    await ensureContactQuestion(tx, form.id);
    return tx.form.findUniqueOrThrow({ where: { id: form.id }, include: FORM_INCLUDE });
  });
}

/** Formulaires d'une église (non supprimés), avec leurs décomptes de réponses. */
export async function listForms(churchId: string) {
  const [forms, active] = await Promise.all([
    prisma.form.findMany({
      where: { churchId, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        kind: true,
        access: true,
        anonymous: true,
        status: true,
        opensAt: true,
        closesAt: true,
        maxResponses: true,
        purgedAt: true,
        updatedAt: true,
        _count: { select: { responses: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.formResponse.groupBy({
      by: ["formId"],
      where: { churchId, status: { in: [...ACTIVE_STATUSES] } },
      _count: { _all: true },
    }),
  ]);
  const activeBy = new Map(active.map((a) => [a.formId, a._count._all]));
  return forms.map(({ _count, ...f }) => ({ ...f, responses: _count.responses, activeResponses: activeBy.get(f.id) ?? 0 }));
}

/** Formulaire non supprimé, avec ses questions ; null sinon. */
export async function getForm(formId: string, db: Tx = prisma): Promise<FormWithQuestions | null> {
  return db.form.findFirst({ where: { id: formId, deletedAt: null }, include: FORM_INCLUDE });
}

/** Décomptes utiles à la gestion et à `assertSafeEdit`. */
export async function usageCounts(formId: string, db: Tx = prisma) {
  const [responses, answered, holding, holdingLevels, usedLevels] = await Promise.all([
    db.formResponse.count({ where: { formId } }),
    db.formAnswer.groupBy({ by: ["questionId"], where: { response: { formId } }, _count: { _all: true } }),
    db.formResponseChoice.groupBy({
      by: ["choiceId"],
      where: { response: { formId, status: { in: [...HOLDING_STATUSES] } } },
      _count: { _all: true },
    }),
    db.formResponse.groupBy({ by: ["levelId"], where: { formId, levelId: { not: null }, status: { in: [...HOLDING_STATUSES] } }, _count: { _all: true } }),
    db.formResponse.groupBy({ by: ["sessionId", "levelId"], where: { formId, levelId: { not: null } }, _count: { _all: true } }),
  ]);
  const used = await db.formResponseChoice.findMany({ where: { response: { formId } }, select: { choiceId: true }, distinct: ["choiceId"] });
  return {
    responses,
    answeredQuestions: new Set(answered.map((a) => a.questionId)),
    holdingByChoice: new Map(holding.map((h) => [h.choiceId, h._count._all])),
    usedChoices: new Set(used.map((u) => u.choiceId)),
    holdingByLevel: new Map(holdingLevels.map((h) => [h.levelId!, h._count._all])),
    usedLevels: new Set(usedLevels.map((u) => u.levelId!)),
    usedSessions: new Set(usedLevels.map((u) => u.sessionId!)),
  };
}

type Usage = Awaited<ReturnType<typeof usageCounts>>;

/** Questions telles qu'elles seront enregistrées : clés → identifiants, positions. */
interface PlannedQuestion {
  input: QuestionInput;
  id: string;
  isNew: boolean;
}

/** Contrôles de cohérence d'une liste de questions (indépendants des réponses). */
function validateQuestions(questions: QuestionInput[], kind: string) {
  const keys = new Set<string>();
  if (questions.filter((q) => q.type === "SESSION_LEVEL").length > 1) throw new ApiError(400, "Une seule question « Session et niveau » par formulaire");
  for (const [index, q] of questions.entries()) {
    if (keys.has(q.key)) throw new ApiError(400, "Deux questions portent la même clé");
    keys.add(q.key);
    if (q.type === "SESSION_LEVEL") {
      if (kind !== "REGISTRATION") throw new ApiError(400, "« Session et niveau » est réservé aux inscriptions");
      if (q.condition) throw new ApiError(400, "« Session et niveau » est toujours affichée : pas de condition");
    }
    const isChoice = CHOICE_TYPES.includes(q.type);
    if (isChoice && !q.choices?.length) throw new ApiError(400, `« ${q.label} » : ajoutez au moins un choix`);
    if (!isChoice && q.choices?.length) throw new ApiError(400, `« ${q.label} » : ce type de question n'a pas de choix`);
    const choiceKeys = new Set(q.choices?.map((c) => c.key));
    if (choiceKeys.size !== (q.choices?.length ?? 0)) throw new ApiError(400, `« ${q.label} » : deux choix portent la même clé`);
    if (q.config && q.type !== "NUMBER") throw new ApiError(400, `« ${q.label} » : réglage réservé aux nombres`);
    if (q.config?.min !== undefined && q.config.max !== undefined && q.config.min > q.config.max) {
      throw new ApiError(400, `« ${q.label} » : minimum supérieur au maximum`);
    }
    if (q.condition) {
      const parentIndex = questions.findIndex((p) => p.key === q.condition!.questionKey);
      if (parentIndex < 0 || parentIndex >= index) throw new ApiError(400, `« ${q.label} » : la condition doit porter sur une question précédente`);
      const parent = questions[parentIndex];
      if (parent.type === "SESSION_LEVEL") throw new ApiError(400, `« ${q.label} » : pas de condition sur « Session et niveau »`);
      if (CHOICE_TYPES.includes(parent.type) && !parent.choices?.some((c) => c.key === q.condition!.value)) {
        throw new ApiError(400, `« ${q.label} » : la condition vise un choix inconnu`);
      }
      if (parent.type === "YES_NO" && !["true", "false"].includes(q.condition.value)) {
        throw new ApiError(400, `« ${q.label} » : la condition d'un oui/non vaut « true » ou « false »`);
      }
    }
  }
}

/** Contrôles de cohérence des sessions et niveaux. */
function validateSessions(sessions: SessionInput[], kind: string) {
  if (sessions.length > 0 && kind !== "REGISTRATION") throw new ApiError(400, "Les sessions sont réservées aux inscriptions");
  const keys = new Set<string>();
  for (const session of sessions) {
    if (keys.has(session.key)) throw new ApiError(400, "Deux sessions portent la même clé");
    keys.add(session.key);
    if (Number.isNaN(Date.parse(`${session.startDate}T00:00:00Z`))) throw new ApiError(400, `« ${session.label} » : date invalide`);
    const codes = new Set<string>();
    for (const level of session.levels) {
      if (keys.has(level.key)) throw new ApiError(400, "Deux niveaux portent la même clé");
      keys.add(level.key);
      if (codes.has(level.code)) throw new ApiError(400, `« ${session.label} » : le niveau ${level.code} apparaît deux fois`);
      codes.add(level.code);
    }
  }
}

/**
 * Modification sûre d'un formulaire qui a des réponses (spec 079, cas limites) : refus explicite
 * de ce qui ferait perdre ou fausser des réponses.
 */
export function assertSafeEdit(
  form: FormWithQuestions,
  next: { anonymous?: boolean; questions?: QuestionInput[]; sessions?: SessionInput[] },
  usage: Usage
) {
  if (usage.responses === 0) return;
  if (next.anonymous !== undefined && next.anonymous !== form.anonymous) {
    throw new ApiError(409, "Ce formulaire a des réponses : on ne peut plus changer son anonymat");
  }
  if (next.sessions) assertSafeSessions(form, next.sessions, usage);
  if (!next.questions) return;
  const byKey = new Map(next.questions.map((q) => [q.key, q]));
  for (const q of form.questions) {
    const kept = byKey.get(q.id);
    const answered = usage.answeredQuestions.has(q.id);
    if (!kept) {
      if (answered) throw new ApiError(409, `« ${q.label} » a des réponses : elle ne peut pas être supprimée`);
      continue;
    }
    if (answered && kept.type !== q.type) throw new ApiError(409, `« ${q.label} » a des réponses : son type ne peut pas changer`);
    const nextChoices = new Map((kept.choices ?? []).map((c) => [c.key, c]));
    for (const c of q.choices) {
      const nc = nextChoices.get(c.id);
      if (!nc) {
        if (usage.usedChoices.has(c.id)) throw new ApiError(409, `« ${c.label} » a été choisi : ce choix ne peut pas être supprimé`);
        continue;
      }
      const holding = usage.holdingByChoice.get(c.id) ?? 0;
      if (nc.capacity != null && nc.capacity < holding) {
        throw new ApiError(409, `« ${c.label} » : ${holding} réponse(s) l'ont déjà retenu, les places ne peuvent pas descendre en dessous`);
      }
    }
  }
  for (const q of next.questions) {
    const existing = form.questions.find((x) => x.id === q.key);
    if (!existing && q.required) throw new ApiError(409, `« ${q.label} » : une question ajoutée après les premières réponses doit être facultative`);
  }
}

/** Sessions et niveaux qui ont des inscrits : ni supprimés, ni ramenés sous leurs inscrits. */
function assertSafeSessions(form: FormWithQuestions, sessions: SessionInput[], usage: Usage) {
  const nextSessions = new Map(sessions.map((s) => [s.key, s]));
  for (const session of form.sessions) {
    const kept = nextSessions.get(session.id);
    if (!kept) {
      if (usage.usedSessions.has(session.id)) throw new ApiError(409, `« ${session.label} » a des inscrits : elle ne peut pas être supprimée`);
      continue;
    }
    const nextLevels = new Map(kept.levels.map((l) => [l.key, l]));
    for (const level of session.levels) {
      const nl = nextLevels.get(level.id);
      if (!nl) {
        if (usage.usedLevels.has(level.id)) throw new ApiError(409, `Niveau ${level.code} de « ${session.label} » : il a des inscrits, il ne peut pas être supprimé`);
        continue;
      }
      const holding = usage.holdingByLevel.get(level.id) ?? 0;
      if (nl.capacity < holding) {
        throw new ApiError(409, `Niveau ${level.code} de « ${session.label} » : ${holding} inscrit(s), les places ne peuvent pas descendre en dessous`);
      }
    }
  }
}

/** Écrit les sessions et leurs niveaux : mises à jour, créations, suppressions. */
async function writeSessions(tx: Tx, form: FormWithQuestions, sessions: SessionInput[]) {
  const existing = new Map(form.sessions.map((s) => [s.id, s]));
  const keep = new Set(sessions.filter((s) => existing.has(s.key)).map((s) => s.key));
  const removed = form.sessions.filter((s) => !keep.has(s.id)).map((s) => s.id);
  if (removed.length) await tx.formSession.deleteMany({ where: { id: { in: removed } } });
  for (const [position, input] of sessions.entries()) {
    const before = existing.get(input.key);
    const id = before ? before.id : randomUUID();
    const data = { position, label: input.label, startDate: new Date(`${input.startDate}T00:00:00.000Z`), days: input.days };
    if (before) await tx.formSession.update({ where: { id }, data });
    else await tx.formSession.create({ data: { ...data, id, formId: form.id } });

    const beforeLevels = new Map((before?.levels ?? []).map((l) => [l.id, l]));
    const keepLevels = new Set(input.levels.filter((l) => beforeLevels.has(l.key)).map((l) => l.key));
    const removedLevels = (before?.levels ?? []).filter((l) => !keepLevels.has(l.id)).map((l) => l.id);
    if (removedLevels.length) await tx.formLevel.deleteMany({ where: { id: { in: removedLevels } } });
    for (const [i, level] of input.levels.entries()) {
      const levelData = { position: i, code: level.code, label: level.label ?? null, capacity: level.capacity, isEntry: level.isEntry };
      if (beforeLevels.has(level.key)) await tx.formLevel.update({ where: { id: level.key }, data: levelData });
      else await tx.formLevel.create({ data: { ...levelData, id: randomUUID(), sessionId: id } });
    }
  }
}

/** Écrit la liste des questions : mises à jour, créations, suppressions, puis conditions. */
async function writeQuestions(tx: Tx, form: FormWithQuestions, questions: QuestionInput[]) {
  const existingIds = new Set(form.questions.map((q) => q.id));
  const planned: PlannedQuestion[] = questions.map((input) => ({
    input,
    id: existingIds.has(input.key) ? input.key : randomUUID(),
    isNew: !existingIds.has(input.key),
  }));
  const idByKey = new Map(planned.map((p) => [p.input.key, p.id]));
  const keptIds = new Set(planned.filter((p) => !p.isNew).map((p) => p.id));

  const removed = form.questions.filter((q) => !keptIds.has(q.id)).map((q) => q.id);
  if (removed.length) await tx.formQuestion.deleteMany({ where: { id: { in: removed } } });

  const choiceIdByKey = new Map<string, string>();
  for (const [position, p] of planned.entries()) {
    const data = {
      position,
      type: p.input.type as QuestionType,
      label: p.input.label,
      help: p.input.help ?? null,
      required: p.input.required,
      config: (p.input.config ?? undefined) as Prisma.InputJsonValue | undefined,
      conditionQuestionId: null,
      conditionValue: null,
    };
    if (p.isNew) await tx.formQuestion.create({ data: { ...data, id: p.id, formId: form.id } });
    else await tx.formQuestion.update({ where: { id: p.id }, data });

    const before = form.questions.find((q) => q.id === p.id)?.choices ?? [];
    const beforeIds = new Set(before.map((c) => c.id));
    const choices = (p.input.choices ?? []).map((c, i) => ({ c, i, id: beforeIds.has(c.key) ? c.key : randomUUID(), isNew: !beforeIds.has(c.key) }));
    const keepChoice = new Set(choices.filter((c) => !c.isNew).map((c) => c.id));
    const removedChoices = before.filter((c) => !keepChoice.has(c.id)).map((c) => c.id);
    if (removedChoices.length) await tx.formChoice.deleteMany({ where: { id: { in: removedChoices } } });
    for (const { c, i, id, isNew } of choices) {
      choiceIdByKey.set(c.key, id);
      const choiceData = { position: i, label: c.label, capacity: c.capacity ?? null };
      if (isNew) await tx.formChoice.create({ data: { ...choiceData, id, questionId: p.id } });
      else await tx.formChoice.update({ where: { id }, data: choiceData });
    }
  }

  for (const p of planned) {
    if (!p.input.condition) continue;
    const parentId = idByKey.get(p.input.condition.questionKey)!;
    const value = choiceIdByKey.get(p.input.condition.value) ?? p.input.condition.value;
    await tx.formQuestion.update({ where: { id: p.id }, data: { conditionQuestionId: parentId, conditionValue: value } });
  }
}

/** Mise à jour des réglages et, si fournies, de toutes les questions (liste complète). */
export async function updateForm(formId: string, input: FormUpdateInput): Promise<FormWithQuestions> {
  const { form, offered } = await prisma.$transaction(async (tx) => {
    const form = await tx.form.update({ where: { id: formId }, data: { updatedAt: new Date() }, include: FORM_INCLUDE });
    if (form.deletedAt) throw new ApiError(404, "Formulaire introuvable");
    if (form.purgedAt) throw new ApiError(409, "Les réponses de ce formulaire ont été effacées : il ne se modifie plus");
    if (input.questions) validateQuestions(input.questions, form.kind);
    if (input.sessions) validateSessions(input.sessions, form.kind);
    const anonymous = input.anonymous ?? form.anonymous;
    if (anonymous && form.kind !== "SURVEY") throw new ApiError(400, "Seul un sondage peut être anonyme");
    assertSafeEdit(form, { anonymous: input.anonymous, questions: input.questions, sessions: input.sessions }, await usageCounts(formId, tx));

    const opensAt = input.opensAt === undefined ? form.opensAt : input.opensAt;
    const closesAt = input.closesAt === undefined ? form.closesAt : input.closesAt;
    if (opensAt && closesAt && opensAt >= closesAt) throw new ApiError(400, "La fin des réponses doit suivre leur ouverture");

    const { questions, sessions, slug, ...settings } = input;
    if (slug && slug !== form.slug && (await uniqueSlug(form.churchId, slug, tx, form.id)) !== slug) {
      throw new ApiError(409, "Cette adresse est déjà prise par un autre formulaire de l'église");
    }
    await tx.form.update({ where: { id: formId }, data: { ...settings, ...(slug ? { slug } : {}) } });
    if (sessions) await writeSessions(tx, form, sessions);
    if (questions) await writeQuestions(tx, await tx.form.findUniqueOrThrow({ where: { id: formId }, include: FORM_INCLUDE }), questions);
    await ensureContactQuestion(tx, formId);
    await ensureRegistrationQuestion(tx, formId);
    // Places ajoutées (ou liste d'attente activée) : proposées aux premiers en attente.
    const offered = await fillOpenPlaces(tx, formId);
    return { form: await tx.form.findUniqueOrThrow({ where: { id: formId }, include: FORM_INCLUDE }), offered };
  });
  await notifyOffers(offered);
  return form;
}

/** Copie d'un formulaire en brouillon : réglages, questions, choix et conditions, sans réponse. */
export async function duplicateForm(formId: string, userId: string, title?: string) {
  const source = await getForm(formId);
  if (!source) throw new ApiError(404, "Formulaire introuvable");
  const newTitle = title ?? `${source.title} (copie)`.slice(0, 150);
  return prisma.$transaction(async (tx) => {
    const copy = await tx.form.create({
      data: {
        churchId: source.churchId,
        createdById: userId,
        title: newTitle,
        description: source.description,
        kind: source.kind,
        access: source.access,
        anonymous: source.anonymous,
        maxResponses: source.maxResponses,
        waitlistEnabled: source.waitlistEnabled,
        offerHoldHours: source.offerHoldHours,
        retentionMonths: source.retentionMonths,
        eventId: source.eventId,
        ticketingEventId: source.ticketingEventId,
        slug: await uniqueSlug(source.churchId, slugify(newTitle), tx),
      },
      include: FORM_INCLUDE,
    });
    await writeSessions(
      tx,
      copy,
      source.sessions.map((session) => ({
        key: `copy-${session.id}`,
        label: session.label,
        startDate: session.startDate.toISOString().slice(0, 10),
        days: session.days === 2 ? 2 : 1,
        levels: session.levels.map((l) => ({ key: `copy-${l.id}`, code: l.code, label: l.label, capacity: l.capacity, isEntry: l.isEntry })),
      }))
    );
    await writeQuestions(
      tx,
      copy,
      source.questions.map((q) => ({
        key: q.id,
        type: q.type,
        label: q.label,
        help: q.help,
        required: q.required,
        config: (q.config as QuestionInput["config"]) ?? null,
        choices: q.choices.map((c) => ({ key: c.id, label: c.label, capacity: c.capacity })),
        condition: q.conditionQuestionId ? { questionKey: q.conditionQuestionId, value: q.conditionValue ?? "" } : null,
      }))
    );
    return tx.form.findUniqueOrThrow({ where: { id: copy.id }, include: FORM_INCLUDE });
  });
}
