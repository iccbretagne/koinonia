import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { CampaignAssignmentStatus, CampaignStatus } from "@/generated/prisma/client";
import {
  ruleSchema,
  storedFormDefinitionSchema,
  type campaignSettingsSchema,
  type DefinitionItem,
  type Qualifier,
  type Rule,
} from "../schemas";
import { hasCampaignsManage } from "../auth";
import { completeness, flattenItems, type Completeness, type StoredAnswer } from "./definition";
import { evaluateRules, ruleScope, type RuleEvaluation, type RuleValue } from "./rules";
import { dayToDate, dueAtToDate } from "./values";
import { notifyCampaignOpened } from "./notify";

/**
 * Niveau campagne (spec 090) : listes, tableau de pilotage, paramètres, cycle de vie,
 * gestionnaires. Les droits sont vérifiés par les gardes (`../auth`) avant l'appel ; ici, l'église
 * qui fait foi est toujours celle de la campagne.
 */

export interface CampaignActorRef {
  userId: string;
  name: string;
}

const userName = (u: { displayName: string | null; name: string | null; email: string }) => u.displayName ?? u.name ?? u.email;

// ── Mes campagnes ──────────────────────────────────────────────────────────────────────────────

export interface MyCampaigns {
  managed: {
    id: string;
    churchId: string;
    key: string;
    title: string;
    status: CampaignStatus;
    dueAt: Date | null;
    assignments: { total: number; submitted: number; validated: number };
  }[];
  assignments: {
    id: string;
    label: string;
    formTitle: string;
    campaignId: string;
    campaignTitle: string;
    campaignStatus: CampaignStatus;
    status: CampaignAssignmentStatus;
    dueAt: Date | null;
  }[];
}

/**
 * Campagnes que le compte pilote (droit `campaigns:manage` ou gestionnaire désigné, dans ses
 * églises) et questionnaires dont il est répondant (campagne sortie du brouillon).
 */
export async function listMyCampaigns(session: Session): Promise<MyCampaigns> {
  const userId = session.user.id;
  const churchIds = [...new Set(session.user.churchRoles.map((r) => r.churchId))];
  const manageChurchIds: string[] = [];
  for (const churchId of churchIds) if (await hasCampaignsManage(session, churchId)) manageChurchIds.push(churchId);

  const [campaigns, respondents] = await Promise.all([
    prisma.campaign.findMany({
      where: {
        churchId: { in: churchIds },
        OR: [{ churchId: { in: manageChurchIds } }, { managers: { some: { userId } } }],
      },
      select: {
        id: true,
        churchId: true,
        key: true,
        title: true,
        status: true,
        dueAt: true,
        assignments: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.campaignRespondent.findMany({
      where: { userId, assignment: { campaign: { status: { not: "DRAFT" }, churchId: { in: churchIds } } } },
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
    }),
  ]);

  return {
    managed: campaigns.map((c) => ({
      id: c.id,
      churchId: c.churchId,
      key: c.key,
      title: c.title,
      status: c.status,
      dueAt: c.dueAt,
      assignments: {
        total: c.assignments.length,
        submitted: c.assignments.filter((a) => a.status === "SUBMITTED").length,
        validated: c.assignments.filter((a) => a.status === "VALIDATED").length,
      },
    })),
    assignments: respondents.map(({ assignment: a }) => ({
      id: a.id,
      label: a.label,
      formTitle: a.form.title,
      campaignId: a.campaign.id,
      campaignTitle: a.campaign.title,
      campaignStatus: a.campaign.status,
      status: a.status,
      dueAt: a.dueAt ?? a.campaign.dueAt,
    })),
  };
}

/**
 * Espace « Collectes » dans la navigation : `campaigns:manage` dans l'église, gestionnaire d'une
 * de ses campagnes, ou répondant d'une affectation d'une campagne sortie du brouillon. Deux
 * `count` au plus.
 */
export async function hasCampaignsSpace(session: Session, churchId: string): Promise<boolean> {
  if (await hasCampaignsManage(session, churchId)) return true;
  if (!session.user.churchRoles.some((r) => r.churchId === churchId)) return false;
  const userId = session.user.id;
  const managed = await prisma.campaignManager.count({ where: { userId, campaign: { churchId } } });
  if (managed > 0) return true;
  const answering = await prisma.campaignRespondent.count({
    where: { userId, assignment: { campaign: { churchId, status: { not: "DRAFT" } } } },
  });
  return answering > 0;
}

export interface OpenAssignment {
  id: string;
  label: string;
  formTitle: string;
  campaignTitle: string;
  status: CampaignAssignmentStatus;
  /** Échéance de l'affectation, à défaut celle de la campagne. */
  dueAt: Date | null;
}

/**
 * Questionnaires à remplir (carte de l'Accueil) : affectations dont le compte est répondant, dans
 * une campagne **ouverte** de cette église, non soumises. Par échéance.
 */
export async function listMyOpenAssignments(session: Session, churchId: string): Promise<OpenAssignment[]> {
  if (!session.user.churchRoles.some((r) => r.churchId === churchId)) return [];
  const rows = await prisma.campaignRespondent.findMany({
    where: {
      userId: session.user.id,
      assignment: { status: { in: ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"] }, campaign: { churchId, status: "OPEN" } },
    },
    select: {
      assignment: {
        select: {
          id: true,
          label: true,
          status: true,
          dueAt: true,
          form: { select: { title: true } },
          campaign: { select: { title: true, dueAt: true } },
        },
      },
    },
  });
  return rows
    .map(({ assignment: a }) => ({
      id: a.id,
      label: a.label,
      formTitle: a.form.title,
      campaignTitle: a.campaign.title,
      status: a.status,
      dueAt: a.dueAt ?? a.campaign.dueAt,
    }))
    .sort((x, y) => (x.dueAt?.getTime() ?? Infinity) - (y.dueAt?.getTime() ?? Infinity) || x.formTitle.localeCompare(y.formTitle, "fr"));
}

// ── Pilotage ───────────────────────────────────────────────────────────────────────────────────

/** Règles stockées (`Campaign.rules`), relues avec leur schéma ; une règle illisible est ignorée. */
export function storedRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const parsed = ruleSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Items de premier niveau d'un questionnaire stocké. */
export function storedItems(definition: unknown): DefinitionItem[] {
  const parsed = storedFormDefinitionSchema.safeParse(definition);
  return parsed.success ? flattenItems(parsed.data.sections) : [];
}

export interface CampaignCheck extends RuleEvaluation {
  scope: "local" | "cross";
  formKey: string | null;
  assignmentId: string | null;
  assignmentLabel: string | null;
}

type AnswerRow = { assignmentId: string; code: string; value: unknown; qualifier: Qualifier; note: string | null };

/**
 * Valeurs d'une règle croisée : un code n'appartient qu'à un questionnaire, mais un questionnaire
 * peut avoir plusieurs destinataires — leurs nombres s'additionnent ; un oui/non n'est retenu que
 * s'il est le même partout (sinon la règle est ignorée).
 */
function mergedValues(answers: readonly AnswerRow[]): Map<string, RuleValue> {
  const byCode = new Map<string, AnswerRow[]>();
  for (const a of answers) byCode.set(a.code, [...(byCode.get(a.code) ?? []), a]);
  const out = new Map<string, RuleValue>();
  for (const [code, rows] of byCode) {
    if (rows.length === 1) {
      out.set(code, { value: rows[0].value, qualifier: rows[0].qualifier });
      continue;
    }
    const usable = rows.filter((r) => r.qualifier !== "NOT_APPLICABLE" && r.qualifier !== "NSP");
    if (usable.length !== rows.length) continue;
    if (usable.every((r) => typeof r.value === "number")) {
      const estimated = usable.some((r) => r.qualifier !== "EXACT");
      out.set(code, { value: usable.reduce((s, r) => s + (r.value as number), 0), qualifier: estimated ? "ESTIMATE" : "EXACT" });
    } else if (usable.every((r) => typeof r.value === "boolean" && r.value === usable[0].value)) {
      out.set(code, { value: usable[0].value, qualifier: "EXACT" });
    }
  }
  return out;
}

/** Contrôles de cohérence : règles locales par destinataire, règles croisées sur l'ensemble. */
export function campaignChecks(
  rules: readonly Rule[],
  forms: readonly { key: string; items: readonly DefinitionItem[]; assignments: readonly { id: string; label: string }[] }[],
  answers: readonly AnswerRow[]
): CampaignCheck[] {
  const formKeyByCode = new Map<string, string>();
  for (const f of forms) for (const item of f.items) formKeyByCode.set(item.code, f.key);
  const local = new Map<string, Rule[]>();
  const cross: Rule[] = [];
  for (const rule of rules) {
    const scope = ruleScope(rule, formKeyByCode);
    if (scope === "cross") cross.push(rule);
    else local.set(scope.local, [...(local.get(scope.local) ?? []), rule]);
  }
  const checks: CampaignCheck[] = [];
  for (const f of forms) {
    const formRules = local.get(f.key);
    if (!formRules) continue;
    for (const a of f.assignments) {
      const values = new Map<string, RuleValue>(
        answers.filter((x) => x.assignmentId === a.id).map((x) => [x.code, { value: x.value, qualifier: x.qualifier }])
      );
      for (const e of evaluateRules(formRules, values)) {
        checks.push({ ...e, scope: "local", formKey: f.key, assignmentId: a.id, assignmentLabel: a.label });
      }
    }
  }
  for (const e of evaluateRules(cross, mergedValues(answers))) {
    checks.push({ ...e, scope: "cross", formKey: null, assignmentId: null, assignmentLabel: null });
  }
  return checks;
}

export interface AssignmentOverview {
  id: string;
  key: string;
  label: string;
  status: CampaignAssignmentStatus;
  dueAt: Date | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  validatedAt: Date | null;
  pastoralValidated: boolean;
  reviewReason: string | null;
  lastRemindedAt: Date | null;
  respondents: { id: string; name: string; email: string | null; kind: "account" | "link"; hasLink: boolean }[];
  completeness: Completeness;
  requiredCount: number;
  files: { id: string; requestCode: string; name: string; mime: string; size: number; uploadedAt: Date; uploadedByName: string | null }[];
}

export async function getCampaignOverview(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      churchId: true,
      key: true,
      title: true,
      description: true,
      periodStart: true,
      periodEnd: true,
      dueAt: true,
      status: true,
      fileRetentionDays: true,
      rules: true,
      definitionHash: true,
      openedAt: true,
      closedAt: true,
      filesPurgedAt: true,
      createdAt: true,
      updatedAt: true,
      managers: { select: { userId: true, createdAt: true, user: { select: { name: true, displayName: true, email: true } } } },
      forms: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          key: true,
          title: true,
          confidential: true,
          revision: true,
          definition: true,
          assignments: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              key: true,
              label: true,
              status: true,
              dueAt: true,
              submittedAt: true,
              submittedByName: true,
              validatedAt: true,
              pastoralValidated: true,
              reviewReason: true,
              lastRemindedAt: true,
              respondents: {
                orderBy: { createdAt: "asc" },
                select: { id: true, userId: true, name: true, email: true, tokenHash: true, user: { select: { name: true, displayName: true, email: true } } },
              },
              files: {
                orderBy: { uploadedAt: "asc" },
                select: { id: true, requestCode: true, name: true, mime: true, size: true, uploadedAt: true, uploadedByName: true },
              },
            },
          },
        },
      },
    },
  });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");

  const answers = (await prisma.campaignAnswer.findMany({
    where: { assignment: { campaignId } },
    select: { assignmentId: true, code: true, value: true, qualifier: true, note: true },
  })) as AnswerRow[];

  const forms = campaign.forms.map((f) => {
    const items = storedItems(f.definition);
    const assignments: AssignmentOverview[] = f.assignments.map((a) => {
      const answersByCode = new Map<string, StoredAnswer>(
        answers.filter((x) => x.assignmentId === a.id).map((x) => [x.code, { value: x.value, qualifier: x.qualifier, note: x.note }])
      );
      const fileCount = new Map<string, number>();
      for (const file of a.files) fileCount.set(file.requestCode, (fileCount.get(file.requestCode) ?? 0) + 1);
      return {
        id: a.id,
        key: a.key,
        label: a.label,
        status: a.status,
        dueAt: a.dueAt ?? campaign.dueAt,
        submittedAt: a.submittedAt,
        submittedByName: a.submittedByName,
        validatedAt: a.validatedAt,
        pastoralValidated: a.pastoralValidated,
        reviewReason: a.reviewReason,
        lastRemindedAt: a.lastRemindedAt,
        respondents: a.respondents.map((r) => ({
          id: r.id,
          name: r.user ? userName(r.user) : (r.name ?? r.email ?? "Répondant"),
          email: r.user?.email ?? r.email,
          kind: r.userId ? ("account" as const) : ("link" as const),
          hasLink: !!r.tokenHash,
        })),
        completeness: completeness(items, answersByCode, fileCount),
        requiredCount: items.filter((i) => i.required).length,
        files: a.files,
      };
    });
    return { id: f.id, key: f.key, title: f.title, confidential: f.confidential, revision: f.revision, itemCount: items.length, items, assignments };
  });

  const all = forms.flatMap((f) => f.assignments);
  const done = all.filter((a) => a.status === "SUBMITTED" || a.status === "VALIDATED").length;
  const checks = campaignChecks(storedRules(campaign.rules), forms, answers);

  return {
    campaign: {
      id: campaign.id,
      churchId: campaign.churchId,
      key: campaign.key,
      title: campaign.title,
      description: campaign.description,
      periodStart: campaign.periodStart,
      periodEnd: campaign.periodEnd,
      dueAt: campaign.dueAt,
      status: campaign.status,
      fileRetentionDays: campaign.fileRetentionDays,
      definitionHash: campaign.definitionHash,
      openedAt: campaign.openedAt,
      closedAt: campaign.closedAt,
      filesPurgedAt: campaign.filesPurgedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    },
    forms: forms.map(({ items: _items, ...f }) => f),
    progress: {
      total: all.length,
      byStatus: Object.fromEntries(
        (["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "VALIDATED"] as const).map((s) => [s, all.filter((a) => a.status === s).length])
      ) as Record<CampaignAssignmentStatus, number>,
      rate: all.length ? done / all.length : 0,
      estimates: all.reduce((n, a) => n + a.completeness.estimates.length, 0),
      toResearch: all.reduce((n, a) => n + a.completeness.toResearch.length, 0),
      missing: all.reduce((n, a) => n + a.completeness.missing.length, 0),
      filesExpected: all.reduce((n, a) => n + a.completeness.filesExpected, 0),
      filesReceived: all.reduce((n, a) => n + a.completeness.filesReceived, 0),
    },
    checks,
    managers: campaign.managers.map((m) => ({ userId: m.userId, name: userName(m.user), email: m.user.email, addedAt: m.createdAt })),
  };
}

// ── Paramètres et cycle de vie ─────────────────────────────────────────────────────────────────

export type CampaignSettingsInput = z.infer<typeof campaignSettingsSchema>;

export async function updateCampaignSettings(campaignId: string, input: CampaignSettingsInput, actor: CampaignActorRef) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { churchId: true, periodStart: true, periodEnd: true } });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.periodStart !== undefined) data.periodStart = input.periodStart ? dayToDate(input.periodStart) : null;
  if (input.periodEnd !== undefined) data.periodEnd = input.periodEnd ? dayToDate(input.periodEnd) : null;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? dueAtToDate(input.dueAt) : null;
  if (input.fileRetentionDays !== undefined) data.fileRetentionDays = input.fileRetentionDays;
  const start = (data.periodStart as Date | null | undefined) === undefined ? campaign.periodStart : (data.periodStart as Date | null);
  const end = (data.periodEnd as Date | null | undefined) === undefined ? campaign.periodEnd : (data.periodEnd as Date | null);
  if (start && end && start > end) throw new ApiError(400, "Le début de période doit précéder sa fin");

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data,
    select: { id: true, title: true, description: true, periodStart: true, periodEnd: true, dueAt: true, fileRetentionDays: true, status: true },
  });
  await logAudit({ userId: actor.userId, churchId: campaign.churchId, action: "UPDATE", entityType: "Campaign", entityId: campaignId, details: { fields: Object.keys(data) } });
  return updated;
}

export type CampaignStatusAction = "open" | "close" | "reopen";

const TRANSITIONS: Record<CampaignStatusAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  open: { from: ["DRAFT", "CLOSED"], to: "OPEN" },
  close: { from: ["OPEN"], to: "CLOSED" },
  reopen: { from: ["CLOSED"], to: "OPEN" },
};

/**
 * Ouvre, clôture ou rouvre une campagne. Prise conditionnelle sur l'état courant. Seule la
 * **première** ouverture prévient les répondants.
 */
export async function changeCampaignStatus(campaignId: string, action: CampaignStatusAction, actor: CampaignActorRef) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { churchId: true, status: true, openedAt: true, _count: { select: { assignments: true } } },
  });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");
  const t = TRANSITIONS[action];
  if (!t.from.includes(campaign.status)) throw new ApiError(409, "Cette action n'est pas possible dans l'état actuel de la campagne");
  if (t.to === "OPEN" && campaign._count.assignments === 0) throw new ApiError(409, "La campagne n'a aucun questionnaire à remplir");

  const now = new Date();
  const firstOpening = t.to === "OPEN" && !campaign.openedAt;
  const data =
    t.to === "OPEN"
      ? { status: "OPEN" as const, closedAt: null, ...(firstOpening ? { openedAt: now } : {}) }
      : { status: "CLOSED" as const, closedAt: now };
  const taken = await prisma.campaign.updateMany({ where: { id: campaignId, status: campaign.status }, data });
  if (taken.count === 0) throw new ApiError(409, "La campagne a changé entre-temps : rechargez la page");

  await logAudit({ userId: actor.userId, churchId: campaign.churchId, action: "UPDATE", entityType: "Campaign", entityId: campaignId, details: { status: action } });
  if (firstOpening) {
    try {
      await notifyCampaignOpened(campaignId);
    } catch (error) {
      logger.error({ err: error, campaignId }, "Ouverture de campagne non notifiée");
    }
  }
  return prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true, openedAt: true, closedAt: true } });
}

// ── Gestionnaires ──────────────────────────────────────────────────────────────────────────────

export async function listManagers(campaignId: string) {
  const rows = await prisma.campaignManager.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      createdAt: true,
      user: { select: { name: true, displayName: true, email: true } },
      addedBy: { select: { name: true, displayName: true, email: true } },
    },
  });
  return rows.map((m) => ({
    userId: m.userId,
    name: userName(m.user),
    email: m.user.email,
    addedAt: m.createdAt,
    addedByName: m.addedBy ? userName(m.addedBy) : null,
  }));
}

/** Ajoute un gestionnaire : un compte ayant un rôle dans l'église de la campagne. Idempotent. */
export async function addManager(campaignId: string, userId: string, actor: CampaignActorRef) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { churchId: true } });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");
  const member = await prisma.userChurchRole.findFirst({ where: { userId, churchId: campaign.churchId }, select: { id: true } });
  if (!member) throw new ApiError(400, "Ce compte n'appartient pas à l'église de la campagne");
  const existing = await prisma.campaignManager.findUnique({ where: { campaignId_userId: { campaignId, userId } }, select: { userId: true } });
  if (existing) return { created: false };
  await prisma.campaignManager.create({ data: { campaignId, userId, addedById: actor.userId } });
  await logAudit({ userId: actor.userId, churchId: campaign.churchId, action: "CREATE", entityType: "CampaignManager", entityId: campaignId, details: { managerId: userId } });
  return { created: true };
}

/** Retire un gestionnaire ; jamais le dernier (409). */
export async function removeManager(campaignId: string, userId: string, actor: CampaignActorRef) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { churchId: true } });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");
  const { churchId } = campaign;
  // Verrou sur la campagne : deux retraits simultanés ne peuvent pas retirer les deux derniers.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId} FOR UPDATE`;
    const row = await tx.campaignManager.findUnique({ where: { campaignId_userId: { campaignId, userId } }, select: { userId: true } });
    if (!row) throw new ApiError(404, "Gestionnaire introuvable");
    // Seuls comptent les gestionnaires encore membres de l'église : un ancien membre ne gère plus
    // rien, le retirer ne retire aucun gestionnaire effectif.
    const effective = { campaignId, user: { churchRoles: { some: { churchId } } } };
    const targetEffective = await tx.campaignManager.count({ where: { ...effective, userId } });
    const remaining = await tx.campaignManager.count({ where: { ...effective, userId: { not: userId } } });
    if (targetEffective > 0 && remaining < 1) throw new ApiError(409, "Une campagne garde toujours au moins un gestionnaire");
    await tx.campaignManager.delete({ where: { campaignId_userId: { campaignId, userId } } });
  });
  await logAudit({ userId: actor.userId, churchId: campaign.churchId, action: "DELETE", entityType: "CampaignManager", entityId: campaignId, details: { managerId: userId } });
  return { deleted: true };
}

/** Comptes ayant un rôle dans l'église (ajout d'un gestionnaire ou d'un répondant), 20 au plus. */
export async function searchCandidates(churchId: string, q?: string) {
  const term = q?.trim();
  const users = await prisma.user.findMany({
    where: {
      churchRoles: { some: { churchId } },
      ...(term ? { OR: [{ name: { contains: term } }, { displayName: { contains: term } }, { email: { contains: term } }] } : {}),
    },
    select: { id: true, name: true, displayName: true, email: true },
    orderBy: [{ displayName: "asc" }, { name: "asc" }],
    take: 20,
  });
  return users.map((u) => ({ id: u.id, name: userName(u), email: u.email }));
}
