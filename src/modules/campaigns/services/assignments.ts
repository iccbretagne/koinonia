import type { Session } from "next-auth";
import { Prisma, type CampaignAssignmentStatus, type CampaignStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { AnswerInput, DefinitionItem, Rule, StoredFormDefinition } from "../schemas";
import { EDITABLE_STATUSES, assertEditable, canEdit, type AssignmentAccess, type CampaignActor } from "../auth";
import { completeness, itemIndex, flattenItems, validateAnswerValue, type Completeness, type StoredAnswer } from "./definition";
import { evaluateRules, ruleScope, type RuleEvaluation } from "./rules";
import { newSalt, respondentTokenPair } from "./tokens";
import { notifyAssignmentSubmitted, notifyChangesRequested, notifyRespondentAdded, respondentLink } from "./notify";

/**
 * Niveau questionnaire (spec 090) : lecture d'une affectation, sauvegarde partielle des réponses,
 * soumission, revue par un gestionnaire et répondants. L'accès est déjà résolu par les gardes de
 * `../auth` ; chaque mutation revérifie l'état en base (prise conditionnelle) pour ne jamais
 * écrire sur un questionnaire soumis entre-temps.
 */

const NOT_FOUND = "Questionnaire introuvable";

// ── Journal ────────────────────────────────────────────────────────────────────────────────────

/**
 * Journal d'une opération. Un répondant sans compte n'a pas de compte à citer : l'entrée est
 * rattachée au gestionnaire qui l'a ajouté, avec `via: "lien"` ; sans lui, rien n'est écrit.
 */
export async function auditCampaign(
  access: Pick<AssignmentAccess, "actor" | "assignment">,
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "VIEW",
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  let userId: string | null = null;
  const extra: Record<string, unknown> = {};
  if (access.actor.kind === "user") {
    userId = access.actor.userId;
  } else {
    const respondent = await prisma.campaignRespondent.findUnique({
      where: { id: access.actor.respondentId },
      select: { addedById: true },
    });
    userId = respondent?.addedById ?? null;
    extra.via = "lien";
    extra.respondentId = access.actor.respondentId;
  }
  if (!userId) return;
  await logAudit({
    userId,
    churchId: access.assignment.churchId,
    action,
    entityType,
    entityId,
    details: { campaignId: access.assignment.campaignId, ...details, ...extra },
  });
}

const actorUserId = (actor: CampaignActor) => (actor.kind === "user" ? actor.userId : null);

// ── État d'une affectation ─────────────────────────────────────────────────────────────────────

export function formSections(definition: unknown): StoredFormDefinition {
  const def = (definition ?? {}) as Partial<StoredFormDefinition>;
  return { intro: def.intro, sections: Array.isArray(def.sections) ? def.sections : [] };
}

/** Règles locales à ce questionnaire : tous leurs codes y figurent (codes uniques dans la campagne). */
export function localRules(rules: unknown, items: readonly DefinitionItem[]): Rule[] {
  if (!Array.isArray(rules)) return [];
  const byCode = new Map(items.map((i) => [i.code, "_"]));
  return (rules as Rule[]).filter((r) => ruleScope(r, byCode) !== "cross");
}

interface AnswerRow {
  code: string;
  value: Prisma.JsonValue;
  qualifier: StoredAnswer["qualifier"];
  note: string | null;
}

function answerMap(rows: readonly AnswerRow[]): Map<string, StoredAnswer> {
  return new Map(rows.map((a) => [a.code, { value: a.value, qualifier: a.qualifier, note: a.note }]));
}

function fileCounts(files: readonly { requestCode: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.requestCode, (counts.get(f.requestCode) ?? 0) + 1);
  return counts;
}

/** Alertes locales et complétude, recalculées depuis la base (dans `client` s'il est fourni). */
async function computeState(
  assignmentId: string,
  items: readonly DefinitionItem[],
  rules: unknown,
  client: Prisma.TransactionClient = prisma
) {
  const answers = await client.campaignAnswer.findMany({
    where: { assignmentId },
    select: { code: true, value: true, qualifier: true, note: true },
  });
  const files = await client.campaignFile.findMany({ where: { assignmentId }, select: { requestCode: true } });
  const byCode = answerMap(answers);
  return {
    alerts: evaluateRules(localRules(rules, items), byCode),
    completeness: completeness(items, byCode, fileCounts(files)),
  };
}

async function loadFormContext(access: AssignmentAccess) {
  const form = await prisma.campaignForm.findUnique({
    where: { id: access.assignment.formId },
    select: { revision: true, definition: true, campaign: { select: { rules: true } } },
  });
  if (!form) throw new ApiError(404, NOT_FOUND);
  const items = flattenItems(formSections(form.definition).sections);
  return { form, items, index: itemIndex(formSections(form.definition).sections), rules: form.campaign.rules };
}

export interface AssignmentView {
  role: AssignmentAccess["role"];
  editable: boolean;
  campaign: {
    id: string;
    title: string;
    description: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    dueAt: Date | null;
    status: string;
  };
  form: { id: string; key: string; title: string; confidential: boolean; revision: number } & StoredFormDefinition;
  assignment: {
    id: string;
    key: string;
    label: string;
    status: string;
    /** Échéance de l'affectation, à défaut celle de la campagne. */
    dueAt: Date | null;
    reviewReason: string | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    submittedByName: string | null;
    validatedAt: Date | null;
    pastoralValidated: boolean;
  };
  answers: Record<
    string,
    { value: unknown; qualifier: string; note: string | null; updatedByName: string | null; updatedAt: Date }
  >;
  files: {
    id: string;
    requestCode: string;
    name: string;
    mime: string;
    size: number;
    uploadedAt: Date;
    uploadedByName: string | null;
  }[];
  alerts: RuleEvaluation[];
  completeness: Completeness;
}

/**
 * Tout ce qu'il faut pour afficher et remplir une affectation. Les codes restent dans la réponse
 * (le client en a besoin pour enregistrer) ; l'interface ne les affiche pas.
 */
export async function getAssignmentView(access: AssignmentAccess): Promise<AssignmentView> {
  const a = await prisma.campaignAssignment.findUnique({
    where: { id: access.assignment.id },
    select: {
      id: true,
      key: true,
      label: true,
      status: true,
      dueAt: true,
      reviewReason: true,
      startedAt: true,
      submittedAt: true,
      submittedByName: true,
      validatedAt: true,
      pastoralValidated: true,
      form: { select: { id: true, key: true, title: true, confidential: true, revision: true, definition: true } },
      campaign: {
        select: {
          id: true,
          title: true,
          description: true,
          periodStart: true,
          periodEnd: true,
          dueAt: true,
          status: true,
          rules: true,
        },
      },
      answers: {
        select: { code: true, value: true, qualifier: true, note: true, updatedByName: true, updatedAt: true },
      },
      files: {
        select: {
          id: true,
          requestCode: true,
          name: true,
          mime: true,
          size: true,
          uploadedAt: true,
          uploadedByName: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
  if (!a) throw new ApiError(404, NOT_FOUND);

  const definition = formSections(a.form.definition);
  const items = flattenItems(definition.sections);
  const byCode = answerMap(a.answers);
  const { rules, ...campaign } = a.campaign;

  return {
    role: access.role,
    editable: canEdit({ status: a.status, campaignStatus: a.campaign.status }),
    campaign,
    form: {
      id: a.form.id,
      key: a.form.key,
      title: a.form.title,
      confidential: a.form.confidential,
      revision: a.form.revision,
      ...definition,
    },
    assignment: {
      id: a.id,
      key: a.key,
      label: a.label,
      status: a.status,
      dueAt: a.dueAt ?? a.campaign.dueAt,
      reviewReason: a.reviewReason,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      submittedByName: a.submittedByName,
      validatedAt: a.validatedAt,
      pastoralValidated: a.pastoralValidated,
    },
    answers: Object.fromEntries(
      a.answers.map((r) => [
        r.code,
        { value: r.value, qualifier: r.qualifier, note: r.note, updatedByName: r.updatedByName, updatedAt: r.updatedAt },
      ])
    ),
    files: a.files,
    alerts: evaluateRules(localRules(rules, items), byCode),
    completeness: completeness(items, byCode, fileCounts(a.files)),
  };
}

// ── Mes questionnaires ─────────────────────────────────────────────────────────────────────────

export interface MyAssignment {
  id: string;
  label: string;
  formTitle: string;
  campaignId: string;
  campaignTitle: string;
  campaignStatus: CampaignStatus;
  status: CampaignAssignmentStatus;
  /** Échéance de l'affectation, à défaut celle de la campagne. */
  dueAt: Date | null;
}

/**
 * Questionnaires dont le compte est répondant, dans ses églises, campagne sortie du brouillon
 * (même règle que `getAssignmentAccess`). Ouverts d'abord, puis par échéance.
 */
export async function listMyAssignments(session: Session): Promise<MyAssignment[]> {
  const churchIds = [...new Set(session.user.churchRoles.map((r) => r.churchId))];
  const rows = await prisma.campaignRespondent.findMany({
    where: {
      userId: session.user.id,
      assignment: { campaign: { status: { not: "DRAFT" }, churchId: { in: churchIds } } },
    },
    select: {
      assignment: {
        select: {
          id: true,
          label: true,
          status: true,
          dueAt: true,
          form: { select: { title: true } },
          campaign: { select: { id: true, title: true, status: true, dueAt: true } },
        },
      },
    },
  });
  const list = rows.map(({ assignment: a }) => ({
    id: a.id,
    label: a.label,
    formTitle: a.form.title,
    campaignId: a.campaign.id,
    campaignTitle: a.campaign.title,
    campaignStatus: a.campaign.status,
    status: a.status,
    dueAt: a.dueAt ?? a.campaign.dueAt,
  }));
  const rank = (a: MyAssignment) => (a.campaignStatus === "OPEN" ? 0 : 1);
  return list.sort(
    (x, y) =>
      rank(x) - rank(y) ||
      (x.dueAt?.getTime() ?? Infinity) - (y.dueAt?.getTime() ?? Infinity) ||
      x.campaignTitle.localeCompare(y.campaignTitle, "fr")
  );
}

// ── Saisie ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Verrouille la ligne de l'affectation jusqu'à la fin de la transaction : sauvegarde, soumission,
 * dépôt et retrait de fichier s'y sérialisent (jamais d'écriture après une soumission concurrente).
 */
export async function lockAssignment(tx: Prisma.TransactionClient, assignmentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM campaign_assignments WHERE id = ${assignmentId} FOR UPDATE`;
}

/** Verrouille puis revérifie en base que la saisie est toujours ouverte (soumission ou clôture entre-temps). */
async function assertStillEditable(tx: Prisma.TransactionClient, assignmentId: string) {
  await lockAssignment(tx, assignmentId);
  const current = await tx.campaignAssignment.findUnique({
    where: { id: assignmentId },
    select: { status: true, campaign: { select: { status: true } } },
  });
  if (!current) throw new ApiError(404, NOT_FOUND);
  assertEditable({ status: current.status, campaignStatus: current.campaign.status });
  return current.status;
}

/**
 * Sauvegarde partielle (enregistrement automatique) : chaque code doit appartenir au
 * questionnaire, chaque valeur est validée par son item. Zéro est conservé ; une valeur vide en
 * « exacte » sans note efface la réponse. Premier enregistrement : « En cours » (journalisé).
 */
export async function saveAnswers(access: AssignmentAccess, answers: readonly AnswerInput[]) {
  assertEditable(access.assignment);
  const { index, items, rules } = await loadFormContext(access);

  const checked = answers.map((input) => {
    const item = index.get(input.code);
    if (!item) throw new ApiError(400, `Code inconnu dans ce questionnaire : ${input.code}`);
    const check = validateAnswerValue(item, input.value, input.qualifier ?? "EXACT", input.note ?? null);
    if (!check.ok) throw new ApiError(400, `${item.label} : ${check.error}`);
    return { code: input.code, ...check };
  });

  const assignmentId = access.assignment.id;
  const updatedById = actorUserId(access.actor);
  const updatedByName = access.actor.name.slice(0, 150);

  const { status, started } = await prisma.$transaction(async (tx) => {
    const status = await assertStillEditable(tx, assignmentId);
    for (const a of checked) {
      if (a.value === null && a.qualifier === "EXACT" && !a.note) {
        await tx.campaignAnswer.deleteMany({ where: { assignmentId, code: a.code } });
        continue;
      }
      const data = {
        value: a.value === null ? Prisma.DbNull : (a.value as Prisma.InputJsonValue),
        qualifier: a.qualifier,
        note: a.note,
        updatedById,
        updatedByName,
      };
      await tx.campaignAnswer.upsert({
        where: { assignmentId_code: { assignmentId, code: a.code } },
        create: { assignmentId, code: a.code, ...data },
        update: data,
      });
    }
    if (status !== "NOT_STARTED") return { status, started: false };
    const moved = await tx.campaignAssignment.updateMany({
      where: { id: assignmentId, status: "NOT_STARTED" },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    return { status: "IN_PROGRESS" as const, started: moved.count === 1 };
  });

  if (started) await auditCampaign(access, "UPDATE", "CampaignAssignment", assignmentId, { status: "IN_PROGRESS" });

  const state = await computeState(assignmentId, items, rules);
  return { status, ...state };
}

/**
 * Soumission : tout obligatoire renseigné (« à rechercher » compte comme renseigné), sinon 400
 * avec les libellés manquants. Le questionnaire passe en lecture seule.
 */
export async function submitAssignment(access: AssignmentAccess) {
  assertEditable(access.assignment);
  const { form, index, items, rules } = await loadFormContext(access);
  const assignmentId = access.assignment.id;

  const now = new Date();
  // Verrou, état et complétude dans la même transaction : aucune sauvegarde ni retrait de fichier
  // ne peut s'intercaler entre le contrôle des obligatoires et la soumission.
  const state = await prisma.$transaction(async (tx) => {
    await assertStillEditable(tx, assignmentId);
    const state = await computeState(assignmentId, items, rules, tx);
    if (state.completeness.missing.length > 0) {
      const labels = state.completeness.missing.map((code) => index.get(code)?.label ?? code);
      throw new ApiError(400, `Réponses manquantes : ${labels.join(" ; ")}`);
    }
    const updated = await tx.campaignAssignment.updateMany({
      where: { id: assignmentId, status: { in: [...EDITABLE_STATUSES] }, campaign: { status: "OPEN" } },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
        submittedById: actorUserId(access.actor),
        submittedByName: access.actor.name.slice(0, 150),
        definitionRevision: form.revision,
      },
    });
    if (updated.count !== 1) throw new ApiError(409, "Ce questionnaire n'est plus modifiable");
    return state;
  });

  await auditCampaign(access, "UPDATE", "CampaignAssignment", assignmentId, { status: "SUBMITTED" });
  await notifyAssignmentSubmitted(assignmentId);
  return { status: "SUBMITTED" as const, submittedAt: now, completeness: state.completeness };
}

// ── Revue (gestionnaire) ───────────────────────────────────────────────────────────────────────

export interface ReviewInput {
  action: "request_changes" | "validate";
  reason?: string;
  pastoralValidated?: boolean;
}

/**
 * Demander une correction (soumis ou validé → correction demandée, campagne ouverte requise) ou
 * valider (soumis → validé, case « Validé par la Pasteure »).
 */
export async function reviewAssignment(access: AssignmentAccess & { role: "manager" }, input: ReviewInput) {
  const assignmentId = access.assignment.id;
  const reviewerId = actorUserId(access.actor);
  const now = new Date();

  if (input.action === "request_changes") {
    const reason = input.reason?.trim();
    if (!reason) throw new ApiError(400, "Motif obligatoire");
    if (access.assignment.campaignStatus !== "OPEN") {
      throw new ApiError(409, "La campagne n'est pas ouverte : rouvrez-la pour demander une correction");
    }
    const updated = await prisma.campaignAssignment.updateMany({
      where: { id: assignmentId, status: { in: ["SUBMITTED", "VALIDATED"] }, campaign: { status: "OPEN" } },
      data: {
        status: "CHANGES_REQUESTED",
        reviewReason: reason,
        reviewedAt: now,
        reviewedById: reviewerId,
        validatedAt: null,
        validatedById: null,
        pastoralValidated: false,
      },
    });
    if (updated.count !== 1) throw new ApiError(409, "Seul un questionnaire soumis ou validé peut être renvoyé en correction");
    await auditCampaign(access, "UPDATE", "CampaignAssignment", assignmentId, { status: "CHANGES_REQUESTED" });
    await notifyChangesRequested(assignmentId, reason);
    return { status: "CHANGES_REQUESTED" as const };
  }

  const pastoralValidated = input.pastoralValidated === true;
  const updated = await prisma.campaignAssignment.updateMany({
    where: { id: assignmentId, status: "SUBMITTED" },
    data: {
      status: "VALIDATED",
      validatedAt: now,
      validatedById: reviewerId,
      reviewedAt: now,
      reviewedById: reviewerId,
      pastoralValidated,
    },
  });
  if (updated.count !== 1) throw new ApiError(409, "Seul un questionnaire soumis peut être validé");
  await auditCampaign(access, "UPDATE", "CampaignAssignment", assignmentId, { status: "VALIDATED", pastoralValidated });
  return { status: "VALIDATED" as const, pastoralValidated };
}

// ── Répondants (gestionnaire) ──────────────────────────────────────────────────────────────────

export interface RespondentView {
  id: string;
  kind: "user" | "guest";
  userId: string | null;
  name: string;
  email: string | null;
  hasLink: boolean;
  createdAt: Date;
}

const RESPONDENT_SELECT = {
  id: true,
  userId: true,
  name: true,
  email: true,
  tokenHash: true,
  createdAt: true,
  user: { select: { name: true, displayName: true, email: true } },
} as const;

type RespondentRow = Prisma.CampaignRespondentGetPayload<{ select: typeof RESPONDENT_SELECT }>;

function respondentView(r: RespondentRow): RespondentView {
  if (r.userId && r.user) {
    return {
      id: r.id,
      kind: "user",
      userId: r.userId,
      name: r.user.displayName ?? r.user.name ?? r.user.email,
      email: r.user.email,
      hasLink: false,
      createdAt: r.createdAt,
    };
  }
  return {
    id: r.id,
    kind: "guest",
    userId: null,
    name: r.name ?? "Répondant",
    email: r.email,
    hasLink: !!r.tokenHash,
    createdAt: r.createdAt,
  };
}

export async function listRespondents(access: AssignmentAccess & { role: "manager" }): Promise<RespondentView[]> {
  const rows = await prisma.campaignRespondent.findMany({
    where: { assignmentId: access.assignment.id },
    select: RESPONDENT_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(respondentView);
}

export type RespondentInput = { userId: string } | { name: string; email: string };

/**
 * Ajoute un répondant : un compte ayant un rôle dans l'église de la campagne, ou une personne
 * sans compte (lien personnel dérivé, empreinte seule stockée). Campagne ouverte : prévenu.
 */
export async function addRespondent(access: AssignmentAccess & { role: "manager" }, input: RespondentInput) {
  const assignmentId = access.assignment.id;
  const addedById = actorUserId(access.actor);
  let respondentId: string;

  if ("userId" in input) {
    const role = await prisma.userChurchRole.findFirst({
      where: { userId: input.userId, churchId: access.assignment.churchId },
      select: { userId: true },
    });
    if (!role) throw new ApiError(400, "Ce compte n'a pas de rôle dans l'église de la campagne");
    const existing = await prisma.campaignRespondent.findUnique({
      where: { assignmentId_userId: { assignmentId, userId: input.userId } },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "Cette personne répond déjà à ce questionnaire");
    const created = await prisma.campaignRespondent.create({
      data: { assignmentId, userId: input.userId, addedById },
      select: { id: true },
    });
    respondentId = created.id;
  } else {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const existing = await prisma.campaignRespondent.findFirst({
      where: { assignmentId, userId: null, email },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "Cette adresse répond déjà à ce questionnaire");
    const salt = newSalt();
    respondentId = await prisma.$transaction(async (tx) => {
      const created = await tx.campaignRespondent.create({
        data: { assignmentId, name, email, tokenSalt: salt, addedById },
        select: { id: true },
      });
      await tx.campaignRespondent.update({
        where: { id: created.id },
        data: { tokenHash: respondentTokenPair(created.id, salt).hash },
      });
      return created.id;
    });
  }

  await auditCampaign(access, "CREATE", "CampaignRespondent", respondentId, {
    assignmentId,
    ...("userId" in input ? { userId: input.userId } : { kind: "guest" }),
  });
  if (access.assignment.campaignStatus === "OPEN") await notifyRespondentAdded(respondentId);

  const row = await prisma.campaignRespondent.findUniqueOrThrow({ where: { id: respondentId }, select: RESPONDENT_SELECT });
  return respondentView(row);
}

async function findRespondent(access: AssignmentAccess, respondentId: string) {
  const r = await prisma.campaignRespondent.findFirst({
    where: { id: respondentId, assignmentId: access.assignment.id },
    select: { ...RESPONDENT_SELECT, tokenSalt: true },
  });
  if (!r) throw new ApiError(404, "Répondant introuvable");
  return r;
}

/** Retire un répondant ; son lien personnel cesse de fonctionner. */
export async function removeRespondent(access: AssignmentAccess & { role: "manager" }, respondentId: string) {
  const r = await findRespondent(access, respondentId);
  await prisma.campaignRespondent.delete({ where: { id: r.id } });
  await auditCampaign(access, "DELETE", "CampaignRespondent", r.id, {
    assignmentId: access.assignment.id,
    ...(r.userId ? { userId: r.userId } : { kind: "guest" }),
  });
  return { deleted: true as const };
}

/**
 * Nouveau lien pour un répondant sans compte : nouveau sel, l'ancien lien est révoqué. Campagne
 * ouverte : le lien lui est envoyé.
 */
export async function regenerateRespondentLink(access: AssignmentAccess & { role: "manager" }, respondentId: string) {
  const r = await findRespondent(access, respondentId);
  if (r.userId) throw new ApiError(400, "Un répondant avec compte n'a pas de lien personnel");
  const salt = newSalt();
  await prisma.campaignRespondent.update({
    where: { id: r.id },
    data: { tokenSalt: salt, tokenHash: respondentTokenPair(r.id, salt).hash },
  });
  await auditCampaign(access, "UPDATE", "CampaignRespondent", r.id, {
    assignmentId: access.assignment.id,
    link: "regenerated",
  });
  if (access.assignment.campaignStatus === "OPEN") await notifyRespondentAdded(r.id);
  return { link: respondentLink({ id: r.id, tokenSalt: salt }) };
}
