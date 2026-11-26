import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import {
  campaignDefinitionSchema,
  storedFormDefinitionSchema,
  type CampaignDefinition,
  type DefinitionForm,
  type DefinitionItem,
  type ScalarItem,
  type StoredFormDefinition,
} from "../schemas";
import { flattenItems, validateDefinition } from "./definition";
import { canonicalJson, dayToDate, dueAtToDate, hashJson, sameInstant } from "./values";
import { notifyRespondentAdded } from "./notify";

/**
 * Import d'une définition de campagne (spec 090, plan § Import) : aperçu (`dryRun`) puis
 * application, dans une seule transaction. Idempotent par (église, clé) : réimporter la même
 * définition ne change rien. Toute modification qui ferait perdre des réponses déjà saisies est
 * refusée (409), jamais appliquée en silence. Les répondants sont **ajoutés**, jamais retirés.
 */

export type ImportAction = "create" | "update" | "unchanged" | "remove";

export interface ImportActor {
  userId: string;
  name: string;
}

export interface ImportPreview {
  campaign: { action: "create" | "update" | "unchanged"; key: string; title: string };
  forms: {
    key: string;
    title: string;
    action: ImportAction;
    revision: number;
    itemsAdded: string[];
    itemsChanged: string[];
    itemsRemoved: string[];
  }[];
  assignments: { formKey: string; key: string; label: string; action: ImportAction }[];
  respondents: { resolved: { email: string; name: string }[]; unresolved: string[] };
  blocked: { formKey?: string; code?: string; reason: string }[];
  definitionHash: string;
  /** Campagne existante ou créée (null pour l'aperçu d'une création). */
  campaignId: string | null;
  /** Vrai si la définition a été appliquée (pas un aperçu). */
  applied: boolean;
}

export interface ImportInput {
  churchId: string;
  definition: unknown;
  dryRun: boolean;
  actor: ImportActor;
  /** `campaigns:manage` dans l'église : seul droit qui permet de créer une campagne. */
  canCreate: boolean;
}

/** Contenu stocké d'un questionnaire (`CampaignForm.definition`), sans `undefined`. */
export function storedDefinition(form: Pick<DefinitionForm, "intro" | "sections">): StoredFormDefinition {
  return JSON.parse(canonicalJson({ intro: form.intro, sections: form.sections })) as StoredFormDefinition;
}

/** Empreinte d'un questionnaire : sha256 du JSON canonique `{ intro, sections }`. */
export const formDefinitionHash = (form: Pick<DefinitionForm, "intro" | "sections">) => hashJson(storedDefinition(form));

/** Valide une définition (Zod puis sémantique). Erreurs ⇒ 400 avec la liste. */
export function parseDefinition(input: unknown): CampaignDefinition {
  const parsed = campaignDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const list = parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "définition"} : ${i.message}`);
    throw new ApiError(400, `Définition invalide : ${list.slice(0, 20).join(" ; ")}`);
  }
  const errors = validateDefinition(parsed.data);
  if (errors.length) throw new ApiError(400, `Définition invalide : ${errors.slice(0, 20).join(" ; ")}`);
  return parsed.data;
}

/** Campagne de cette église portant cette clé (pour le contrôle d'accès de la route). */
export async function findCampaignByKey(churchId: string, key: string) {
  return prisma.campaign.findUnique({
    where: { churchId_key: { churchId, key } },
    select: { id: true, churchId: true, status: true, title: true },
  });
}

// ── Réponses existantes ────────────────────────────────────────────────────────────────────────

type UsedValues = Map<string, unknown[]>;

const isSet = (v: unknown) => v !== null && v !== undefined;

function choiceUsed(values: readonly unknown[], key: string): boolean {
  return values.some((v) => v === key || (Array.isArray(v) && v.includes(key)));
}

function groupRows(values: readonly unknown[]): Record<string, unknown>[] {
  return values.flatMap((v) => {
    const rows = (v as { rows?: unknown } | null)?.rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  });
}

const choiceKeys = (item: DefinitionItem | ScalarItem) =>
  item.type === "single" || item.type === "multiple" ? item.choices.map((c) => c.key) : [];

/**
 * Modifications bloquantes d'un questionnaire répondu : item supprimé, type changé, choix retiré
 * et utilisé, champ de groupe supprimé (ou retypé) et renseigné.
 */
function formBlocks(
  formKey: string,
  oldItems: readonly DefinitionItem[],
  newItems: readonly DefinitionItem[],
  used: UsedValues
): ImportPreview["blocked"] {
  const blocked: ImportPreview["blocked"] = [];
  const next = new Map(newItems.map((i) => [i.code, i]));
  for (const old of oldItems) {
    const values = used.get(old.code);
    if (!values) continue;
    const item = next.get(old.code);
    if (!item) {
      blocked.push({ formKey, code: old.code, reason: "Question supprimée alors qu'elle a des réponses" });
      continue;
    }
    if (item.type !== old.type) {
      blocked.push({ formKey, code: old.code, reason: `Type changé (${old.type} → ${item.type}) alors qu'elle a des réponses` });
      continue;
    }
    const kept = new Set(choiceKeys(item));
    for (const key of choiceKeys(old)) {
      if (!kept.has(key) && choiceUsed(values, key)) {
        blocked.push({ formKey, code: old.code, reason: `Choix « ${key} » retiré alors qu'il est utilisé` });
      }
    }
    if (old.type === "group" && item.type === "group") {
      const rows = groupRows(values);
      const fields = new Map(item.fields.map((f) => [f.code, f]));
      for (const field of old.fields) {
        const cells = rows.map((r) => r[field.code]).filter(isSet);
        if (cells.length === 0) continue;
        const nextField = fields.get(field.code);
        if (!nextField) {
          blocked.push({ formKey, code: field.code, reason: `Champ de groupe supprimé alors qu'il est renseigné` });
        } else if (nextField.type !== field.type) {
          blocked.push({ formKey, code: field.code, reason: `Type du champ de groupe changé alors qu'il est renseigné` });
        } else {
          const keptField = new Set(choiceKeys(nextField));
          for (const key of choiceKeys(field)) {
            if (!keptField.has(key) && choiceUsed(cells, key)) {
              blocked.push({ formKey, code: field.code, reason: `Choix « ${key} » retiré alors qu'il est utilisé` });
            }
          }
        }
      }
    }
  }
  return blocked;
}

function itemsDiff(oldItems: readonly DefinitionItem[], newItems: readonly DefinitionItem[]) {
  const old = new Map(oldItems.map((i) => [i.code, i]));
  const next = new Map(newItems.map((i) => [i.code, i]));
  return {
    itemsAdded: newItems.filter((i) => !old.has(i.code)).map((i) => i.code),
    itemsRemoved: oldItems.filter((i) => !next.has(i.code)).map((i) => i.code),
    itemsChanged: newItems.filter((i) => old.has(i.code) && canonicalJson(old.get(i.code)) !== canonicalJson(i)).map((i) => i.code),
  };
}

function oldSections(definition: unknown): StoredFormDefinition["sections"] {
  const parsed = storedFormDefinitionSchema.safeParse(definition);
  return parsed.success ? parsed.data.sections : [];
}

// ── Import ─────────────────────────────────────────────────────────────────────────────────────

export async function importCampaign(input: ImportInput): Promise<ImportPreview> {
  const { churchId, dryRun, actor } = input;
  const def = parseDefinition(input.definition);
  const definitionHash = hashJson(def);
  const c = def.campaign;

  const existing = await prisma.campaign.findUnique({
    where: { churchId_key: { churchId, key: c.key } },
    select: {
      id: true,
      status: true,
      definitionHash: true,
      forms: {
        select: {
          id: true,
          key: true,
          title: true,
          position: true,
          confidential: true,
          definition: true,
          definitionHash: true,
          revision: true,
          assignments: {
            select: { id: true, key: true, label: true, position: true, dueAt: true, respondents: { select: { userId: true } } },
          },
        },
      },
    },
  });
  if (!existing && !input.canCreate) throw new ApiError(403, "Créer une campagne demande le droit de gérer les campagnes");

  // Réponses et fichiers existants, par questionnaire.
  const usedByForm = new Map<string, UsedValues>();
  const assignmentsWithData = new Set<string>();
  if (existing) {
    const formKeyByAssignment = new Map(existing.forms.flatMap((f) => f.assignments.map((a) => [a.id, f.key] as const)));
    const [answers, files] = await Promise.all([
      prisma.campaignAnswer.findMany({ where: { assignment: { campaignId: existing.id } }, select: { assignmentId: true, code: true, value: true } }),
      prisma.campaignFile.findMany({ where: { campaignId: existing.id }, select: { assignmentId: true } }),
    ]);
    for (const a of answers) {
      assignmentsWithData.add(a.assignmentId);
      const formKey = formKeyByAssignment.get(a.assignmentId);
      if (!formKey) continue;
      const used = usedByForm.get(formKey) ?? new Map<string, unknown[]>();
      used.set(a.code, [...(used.get(a.code) ?? []), a.value]);
      usedByForm.set(formKey, used);
    }
    for (const f of files) assignmentsWithData.add(f.assignmentId);
  }

  const preview: ImportPreview = {
    campaign: { action: existing ? (existing.definitionHash === definitionHash ? "unchanged" : "update") : "create", key: c.key, title: c.title },
    forms: [],
    assignments: [],
    respondents: { resolved: [], unresolved: [] },
    blocked: [],
    definitionHash,
    campaignId: existing?.id ?? null,
    applied: false,
  };

  // Questionnaires et affectations.
  const existingForms = new Map((existing?.forms ?? []).map((f) => [f.key, f]));
  for (const [position, form] of def.forms.entries()) {
    const hash = formDefinitionHash(form);
    const newItems = flattenItems(form.sections);
    const old = existingForms.get(form.key);
    if (!old) {
      preview.forms.push({ key: form.key, title: form.title, action: "create", revision: 1, itemsAdded: newItems.map((i) => i.code), itemsChanged: [], itemsRemoved: [] });
    } else {
      const oldItems = flattenItems(oldSections(old.definition));
      const defChanged = old.definitionHash !== hash;
      const metaChanged = old.title !== form.title || old.position !== position || old.confidential !== (form.confidential ?? false);
      preview.forms.push({
        key: form.key,
        title: form.title,
        action: defChanged || metaChanged ? "update" : "unchanged",
        revision: defChanged ? old.revision + 1 : old.revision,
        ...(defChanged ? itemsDiff(oldItems, newItems) : { itemsAdded: [], itemsChanged: [], itemsRemoved: [] }),
      });
      if (defChanged) preview.blocked.push(...formBlocks(form.key, oldItems, newItems, usedByForm.get(form.key) ?? new Map()));
    }
    const oldAssignments = new Map((old?.assignments ?? []).map((a) => [a.key, a]));
    for (const [aPos, a] of form.assignments.entries()) {
      const prev = oldAssignments.get(a.key);
      const dueAt = a.dueAt ? dueAtToDate(a.dueAt) : null;
      const action: ImportAction = !prev
        ? "create"
        : prev.label !== a.label || prev.position !== aPos || !sameInstant(prev.dueAt, dueAt)
          ? "update"
          : "unchanged";
      preview.assignments.push({ formKey: form.key, key: a.key, label: a.label, action });
    }
    for (const prev of old?.assignments ?? []) {
      if (form.assignments.some((a) => a.key === prev.key)) continue;
      preview.assignments.push({ formKey: form.key, key: prev.key, label: prev.label, action: "remove" });
      if (assignmentsWithData.has(prev.id)) {
        preview.blocked.push({ formKey: form.key, reason: `Destinataire « ${prev.label} » supprimé alors qu'il a des réponses ou des fichiers` });
      }
    }
  }
  for (const old of existing?.forms ?? []) {
    if (def.forms.some((f) => f.key === old.key)) continue;
    preview.forms.push({ key: old.key, title: old.title, action: "remove", revision: old.revision, itemsAdded: [], itemsChanged: [], itemsRemoved: flattenItems(oldSections(old.definition)).map((i) => i.code) });
    for (const a of old.assignments) {
      preview.assignments.push({ formKey: old.key, key: a.key, label: a.label, action: "remove" });
      if (assignmentsWithData.has(a.id)) {
        preview.blocked.push({ formKey: old.key, reason: `Questionnaire supprimé alors que « ${a.label} » a des réponses ou des fichiers` });
      }
    }
  }

  // Répondants : comptes ayant un rôle dans l'église, retrouvés par email.
  const emails = [...new Set(def.forms.flatMap((f) => f.assignments.flatMap((a) => a.respondents ?? [])).map((e) => e.trim().toLowerCase()))];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails }, churchRoles: { some: { churchId } } },
        select: { id: true, email: true, name: true, displayName: true },
      })
    : [];
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  preview.respondents.resolved = emails
    .filter((e) => userByEmail.has(e))
    .map((e) => {
      const u = userByEmail.get(e)!;
      return { email: e, name: u.displayName ?? u.name ?? e };
    });
  preview.respondents.unresolved = emails.filter((e) => !userByEmail.has(e));

  /** Comptes à ajouter, par (questionnaire, destinataire). */
  const additions = new Map<string, string[]>();
  for (const form of def.forms) {
    const old = existingForms.get(form.key);
    for (const a of form.assignments) {
      const already = new Set((old?.assignments.find((x) => x.key === a.key)?.respondents ?? []).map((r) => r.userId));
      const ids = [...new Set((a.respondents ?? []).map((e) => userByEmail.get(e.trim().toLowerCase())?.id).filter((id): id is string => !!id))];
      const toAdd = ids.filter((id) => !already.has(id));
      if (toAdd.length) additions.set(`${form.key}\u0000${a.key}`, toAdd);
    }
  }

  if (dryRun) return preview;
  if (preview.blocked.length) throw new ApiError(409, "Import refusé : des modifications feraient perdre des réponses déjà saisies");

  const nothingToDo =
    preview.campaign.action === "unchanged" &&
    preview.forms.every((f) => f.action === "unchanged") &&
    preview.assignments.every((a) => a.action === "unchanged") &&
    additions.size === 0;
  if (existing && nothingToDo) return { ...preview, applied: true };

  const campaignData = {
    title: c.title,
    description: c.description ?? null,
    periodStart: c.periodStart ? dayToDate(c.periodStart) : null,
    periodEnd: c.periodEnd ? dayToDate(c.periodEnd) : null,
    dueAt: c.dueAt ? dueAtToDate(c.dueAt) : null,
    fileRetentionDays: c.fileRetentionDays ?? 30,
    rules: def.rules?.length ? (def.rules as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    definitionHash,
  };

  const addedRespondents: string[] = [];
  const campaignId = await prisma.$transaction(async (tx) => {
    let id: string;
    if (existing) await assertNothingLost(tx, existing, def, preview);
    if (!existing) {
      const created = await tx.campaign.create({ data: { ...campaignData, churchId, key: c.key, createdById: actor.userId }, select: { id: true } });
      id = created.id;
      await tx.campaignManager.create({ data: { campaignId: id, userId: actor.userId, addedById: actor.userId } });
    } else {
      id = existing.id;
      // Même définition : les paramètres retouchés depuis l'interface sont conservés.
      if (preview.campaign.action === "update") await tx.campaign.update({ where: { id }, data: campaignData });
    }

    // Questionnaires supprimés (sans réponse : vérifié plus haut), en cascade.
    const removedForms = (existing?.forms ?? []).filter((f) => !def.forms.some((d) => d.key === f.key));
    if (removedForms.length) await tx.campaignForm.deleteMany({ where: { id: { in: removedForms.map((f) => f.id) } } });

    for (const [position, form] of def.forms.entries()) {
      const plan = preview.forms.find((f) => f.key === form.key)!;
      const old = existingForms.get(form.key);
      const formData = {
        title: form.title,
        position,
        confidential: form.confidential ?? false,
        definition: storedDefinition(form) as unknown as Prisma.InputJsonValue,
        definitionHash: formDefinitionHash(form),
        revision: plan.revision,
      };
      let formId: string;
      if (!old) {
        formId = (await tx.campaignForm.create({ data: { ...formData, campaignId: id, key: form.key }, select: { id: true } })).id;
      } else {
        formId = old.id;
        if (plan.action === "update") await tx.campaignForm.update({ where: { id: formId }, data: formData });
        const gone = old.assignments.filter((a) => !form.assignments.some((x) => x.key === a.key));
        if (gone.length) await tx.campaignAssignment.deleteMany({ where: { id: { in: gone.map((a) => a.id) } } });
      }

      for (const [aPos, a] of form.assignments.entries()) {
        const action = preview.assignments.find((x) => x.formKey === form.key && x.key === a.key)!.action;
        const data = { label: a.label, position: aPos, dueAt: a.dueAt ? dueAtToDate(a.dueAt) : null };
        let assignmentId = old?.assignments.find((x) => x.key === a.key)?.id;
        if (!assignmentId) {
          assignmentId = (
            await tx.campaignAssignment.create({ data: { ...data, formId, campaignId: id, churchId, key: a.key }, select: { id: true } })
          ).id;
        } else if (action === "update") {
          await tx.campaignAssignment.update({ where: { id: assignmentId }, data });
        }
        for (const userId of additions.get(`${form.key}\u0000${a.key}`) ?? []) {
          const r = await tx.campaignRespondent.create({ data: { assignmentId, userId, addedById: actor.userId }, select: { id: true } });
          addedRespondents.push(r.id);
        }
      }
    }
    return id;
  });

  await logAudit({
    userId: actor.userId,
    churchId,
    action: existing ? "UPDATE" : "CREATE",
    entityType: "Campaign",
    entityId: campaignId,
    details: {
      import: true,
      key: c.key,
      definitionHash,
      forms: countActions(preview.forms),
      assignments: countActions(preview.assignments),
      respondentsAdded: addedRespondents.length,
    },
  });

  // Campagne ouverte : chaque nouveau répondant reçoit son questionnaire.
  if (existing?.status === "OPEN") {
    for (const respondentId of addedRespondents) {
      try {
        await notifyRespondentAdded(respondentId);
      } catch (error) {
        logger.error({ err: error, respondentId }, "Répondant ajouté par import non prévenu");
      }
    }
  }

  return { ...preview, campaignId, applied: true };
}

type ExistingCampaign = {
  id: string;
  forms: { id: string; key: string; assignments: { id: string; key: string }[] }[];
};

/**
 * Revérifie, sous verrou, ce que l'aperçu a constaté hors transaction : aucune réponse ni aucun
 * fichier n'est arrivé entre-temps sur un questionnaire ou un destinataire supprimé, ni sur une
 * question retirée. Les verrous (campagne, puis toutes ses affectations) sont pris **avant** toute
 * lecture simple, pour que les comptes voient les écritures validées (sauvegarde et dépôt
 * verrouillent la même ligne d'affectation). Sinon 409.
 */
async function assertNothingLost(
  tx: Prisma.TransactionClient,
  existing: ExistingCampaign,
  def: CampaignDefinition,
  preview: ImportPreview
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${existing.id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM campaign_assignments WHERE campaignId = ${existing.id} FOR UPDATE`;

  const removedAssignmentIds: string[] = [];
  const removedCodes: { assignmentIds: string[]; codes: string[] }[] = [];
  for (const form of existing.forms) {
    const next = def.forms.find((f) => f.key === form.key);
    if (!next) {
      removedAssignmentIds.push(...form.assignments.map((a) => a.id));
      continue;
    }
    const kept = form.assignments.filter((a) => next.assignments.some((x) => x.key === a.key));
    removedAssignmentIds.push(...form.assignments.filter((a) => !kept.includes(a)).map((a) => a.id));
    const codes = preview.forms.find((f) => f.key === form.key)?.itemsRemoved ?? [];
    if (codes.length && kept.length) removedCodes.push({ assignmentIds: kept.map((a) => a.id), codes });
  }

  const conditions = [
    ...(removedAssignmentIds.length ? [{ assignmentId: { in: removedAssignmentIds } }] : []),
    ...removedCodes.map((r) => ({ assignmentId: { in: r.assignmentIds }, code: { in: r.codes } })),
  ];
  const fileConditions = [
    ...(removedAssignmentIds.length ? [{ assignmentId: { in: removedAssignmentIds } }] : []),
    ...removedCodes.map((r) => ({ assignmentId: { in: r.assignmentIds }, requestCode: { in: r.codes } })),
  ];
  if (conditions.length === 0) return;
  const answers = await tx.campaignAnswer.count({ where: { OR: conditions } });
  const files = await tx.campaignFile.count({ where: { OR: fileConditions } });
  if (answers > 0 || files > 0) {
    throw new ApiError(409, "Import refusé : des réponses ou des fichiers ont été saisis entre-temps sur un élément supprimé ; vérifiez de nouveau");
  }
}

function countActions(list: readonly { action: ImportAction }[]): Partial<Record<ImportAction, number>> {
  const out: Partial<Record<ImportAction, number>> = {};
  for (const { action } of list) out[action] = (out[action] ?? 0) + 1;
  return out;
}
