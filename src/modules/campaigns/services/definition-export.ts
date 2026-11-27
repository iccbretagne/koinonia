import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { parisParts } from "@/lib/paris-time";
import {
  messageTemplatesSchema,
  ruleSchema,
  storedFormDefinitionSchema,
  type CampaignDefinition,
  type DefinitionForm,
  type DuplicateCampaignInput,
  type Rule,
  duplicateCampaignSchema,
} from "../schemas";
import { flattenItems } from "./definition";
import { ruleCodes } from "./rules";
import { dueAtToDate } from "./values";
import { importCampaign, parseDefinition, type ImportActor, type ImportPreview } from "./import";

/**
 * Définition d'une campagne (spec 091, EVOL-07/08/09) : export du document `koinonia.campaign`
 * v1 reconstruit depuis la base, duplication (export, ajustement, import en création) et, pour
 * l'assistant IA, réintégration des questionnaires confidentiels qu'il ne voit pas. L'import reste
 * la **seule** porte d'écriture de la structure.
 *
 * Un export ne contient **jamais** de réponse, de fichier, de répondant, de lien ni de secret.
 */

// ── Construction (pure) ────────────────────────────────────────────────────────────────────────

/** Lignes chargées pour reconstruire la définition. */
export interface CampaignDefinitionRows {
  key: string;
  title: string;
  description: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  dueAt: Date | null;
  fileRetentionDays: number;
  rules: unknown;
  messageTemplates: unknown;
  forms: {
    key: string;
    title: string;
    position: number;
    confidential: boolean;
    definition: unknown;
    assignments: { key: string; label: string; position: number; dueAt: Date | null }[];
  }[];
}

export interface ExportDefinitionOptions {
  /** Retirer les questionnaires confidentiels et les règles qui lisent leurs codes (assistant IA). */
  omitConfidential?: boolean;
}

export interface CampaignDefinitionExport {
  definition: CampaignDefinition;
  /** Questionnaires confidentiels omis (`omitConfidential`). */
  omittedForms: number;
  /** Règles omises parce qu'elles lisent un questionnaire omis. */
  omittedRules: number;
}

/** Échéance : le jour `AAAA-MM-JJ` s'il vaut la fin de ce jour à Paris, sinon l'instant ISO. */
export function exportDueAt(date: Date): string {
  const day = parisParts(date).day;
  return dueAtToDate(day).getTime() === date.getTime() ? day : date.toISOString();
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Règles stockées relues avec leur schéma ; une règle illisible est ignorée. */
function readRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const parsed = ruleSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Tous les codes d'un questionnaire, champs de groupe compris. */
function formCodes(form: Pick<DefinitionForm, "sections">): Set<string> {
  return new Set(flattenItems(form.sections).flatMap((i) => [i.code, ...(i.type === "group" ? i.fields.map((f) => f.code) : [])]));
}

/**
 * Document v1 depuis les lignes chargées : champs de campagne, messages, questionnaires et
 * destinataires dans l'ordre, règles. Validé (schéma puis sémantique) dès qu'il reste un
 * questionnaire ; une définition stockée devenue invalide ⇒ 400 avec la liste.
 */
export function buildCampaignDefinition(rows: CampaignDefinitionRows, options: ExportDefinitionOptions = {}): CampaignDefinitionExport {
  const messages = messageTemplatesSchema.safeParse(rows.messageTemplates);
  const allForms = buildFullForms(rows).map((f) => f.form);
  const hidden = options.omitConfidential ? allForms.filter((f) => f.confidential) : [];
  const hiddenCodes = new Set(hidden.flatMap((f) => [...formCodes(f)]));
  const allRules = readRules(rows.rules);
  const rules = allRules.filter((r) => !ruleCodes(r).some((c) => hiddenCodes.has(c)));
  const forms = allForms.filter((f) => !hidden.includes(f));

  const definition = {
    format: "koinonia.campaign" as const,
    version: 1 as const,
    campaign: {
      key: rows.key,
      title: rows.title,
      ...(rows.description ? { description: rows.description } : {}),
      ...(rows.periodStart ? { periodStart: day(rows.periodStart) } : {}),
      ...(rows.periodEnd ? { periodEnd: day(rows.periodEnd) } : {}),
      ...(rows.dueAt ? { dueAt: exportDueAt(rows.dueAt) } : {}),
      fileRetentionDays: rows.fileRetentionDays,
      ...(messages.success && Object.keys(messages.data).length ? { messages: messages.data } : {}),
    },
    forms,
    ...(rules.length ? { rules } : {}),
  };
  return {
    definition: forms.length ? parseDefinition(definition) : (definition as CampaignDefinition),
    omittedForms: hidden.length,
    omittedRules: allRules.length - rules.length,
  };
}

// ── Export ─────────────────────────────────────────────────────────────────────────────────────

const ROWS_SELECT = {
  key: true,
  title: true,
  description: true,
  periodStart: true,
  periodEnd: true,
  dueAt: true,
  fileRetentionDays: true,
  rules: true,
  messageTemplates: true,
  forms: {
    select: {
      key: true,
      title: true,
      position: true,
      confidential: true,
      definition: true,
      assignments: { select: { key: true, label: true, position: true, dueAt: true } },
    },
  },
} as const;

/** Lignes d'une campagne pour la reconstruction ; 404 si elle n'existe pas. */
export async function loadCampaignDefinitionRows(campaignId: string): Promise<CampaignDefinitionRows> {
  const rows = await prisma.campaign.findUnique({ where: { id: campaignId }, select: ROWS_SELECT });
  if (!rows) throw new ApiError(404, "Campagne introuvable");
  return rows;
}

/**
 * Définition `koinonia.campaign` v1 d'une campagne, réimportable telle quelle (« inchangé »).
 * Jamais de répondant. Les droits sont vérifiés par l'appelant (gestionnaire).
 */
export async function exportCampaignDefinition(campaignId: string, options: ExportDefinitionOptions = {}): Promise<CampaignDefinitionExport> {
  return buildCampaignDefinition(await loadCampaignDefinitionRows(campaignId), options);
}

// ── Questionnaires confidentiels cachés à l'assistant ──────────────────────────────────────────

type RawForm = { key?: unknown } & Record<string, unknown>;
type RawRule = { key?: unknown } & Record<string, unknown>;

/**
 * Refus générique d'un document qui touche à un questionnaire confidentiel caché : ni code, ni clé,
 * ni position. L'appel de l'assistant ne doit jamais servir d'oracle sur ce qu'il ne voit pas.
 */
export const HIDDEN_CONFIDENTIAL_REFUSAL = "Ce document touche à un questionnaire confidentiel : modifiez-le depuis l'écran.";

/** Toutes les valeurs `code` d'un sous-arbre JSON (questions, champs de groupe), même mal formé. */
function rawCodes(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) rawCodes(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "code" && typeof v === "string") out.push(v);
      else rawCodes(v, out);
    }
  }
  return out;
}

/** Toutes les chaînes d'un sous-arbre JSON (une règle cite ses codes dans des chaînes). */
function rawStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) rawStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) rawStrings(v, out);
  return out;
}

/**
 * Assistant IA seulement : réintègre au document reçu les questionnaires confidentiels existants
 * (qu'il ne voit pas) et les règles qui lisent leurs codes, chacun **à son rang d'origine** : un
 * document exporté pour l'assistant puis réimporté tel quel reste « inchangé ». Un import par
 * l'assistant ne peut ainsi ni voir, ni modifier, ni supprimer un questionnaire confidentiel.
 *
 * Refus (400, message générique `HIDDEN_CONFIDENTIAL_REFUSAL`) d'un document qui reprend la clé
 * d'un questionnaire caché ou d'une règle qui le lit, qui contient une question portant l'un de
 * ses codes, ou dont une règle cite l'un de ces codes. Le document est d'abord validé **seul** :
 * ses erreurs ne parlent que de ce qu'il contient ; une erreur qui ne surviendrait qu'une fois les
 * éléments cachés réintégrés reçoit le message générique. Un document illisible est rendu tel
 * quel : l'import le refusera avec ses erreurs.
 */
export function mergeHiddenConfidentialRows(rows: CampaignDefinitionRows, definition: unknown): unknown {
  if (!definition || typeof definition !== "object" || !Array.isArray((definition as { forms?: unknown }).forms)) return definition;
  const doc = definition as { forms: RawForm[]; rules?: unknown };
  const full = buildFullForms(rows);
  const hidden = full.filter((f) => f.form.confidential);
  if (hidden.length === 0) return definition;

  const hiddenKeys = new Set(hidden.map((h) => h.form.key));
  const hiddenCodes = new Set(hidden.flatMap((h) => [...formCodes(h.form)]));
  const allRules = readRules(rows.rules);
  const hiddenRules = allRules.flatMap((rule, index) => (ruleCodes(rule).some((c) => hiddenCodes.has(c)) ? [{ index, rule }] : []));
  const hiddenRuleKeys = new Set(hiddenRules.map((h) => h.rule.key));
  const docRules = Array.isArray(doc.rules) ? (doc.rules as RawRule[]) : [];

  const touchesHidden =
    doc.forms.some((f) => typeof f.key === "string" && hiddenKeys.has(f.key)) ||
    rawCodes(doc.forms).some((c) => hiddenCodes.has(c)) ||
    docRules.some((r) => typeof r?.key === "string" && hiddenRuleKeys.has(r.key)) ||
    rawStrings(docRules).some((v) => hiddenCodes.has(v));
  if (touchesHidden) throw new ApiError(400, HIDDEN_CONFIDENTIAL_REFUSAL);

  // Erreurs du document seul : elles ne citent que ce que l'assistant a lui-même envoyé.
  if (doc.forms.length > 0) parseDefinition(doc);

  const forms: unknown[] = [...doc.forms];
  for (const h of hidden) forms.splice(Math.min(h.index, forms.length), 0, h.form);
  const rules: unknown[] = [...docRules];
  for (const h of hiddenRules) rules.splice(Math.min(h.index, rules.length), 0, h.rule);
  const merged = { ...doc, forms, ...(rules.length ? { rules } : {}) };
  try {
    parseDefinition(merged);
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(400, HIDDEN_CONFIDENTIAL_REFUSAL);
    throw error;
  }
  return merged;
}

/** Questionnaires stockés complets (destinataires compris), avec leur rang. */
function buildFullForms(rows: CampaignDefinitionRows): { index: number; form: DefinitionForm }[] {
  return [...rows.forms]
    .sort((a, b) => a.position - b.position)
    .map((f, index) => {
      const stored = storedFormDefinitionSchema.safeParse(f.definition);
      return {
        index,
        form: {
          key: f.key,
          title: f.title,
          confidential: f.confidential,
          ...(stored.success && stored.data.intro !== undefined ? { intro: stored.data.intro } : {}),
          assignments: [...f.assignments]
            .sort((a, b) => a.position - b.position)
            .map((a) => ({ key: a.key, label: a.label, ...(a.dueAt ? { dueAt: exportDueAt(a.dueAt) } : {}) })),
          sections: stored.success ? stored.data.sections : [],
        },
      };
    });
}

/** Réintégration des questionnaires confidentiels d'une campagne existante (voir `mergeHiddenConfidentialRows`). */
export async function mergeHiddenConfidential(campaignId: string, definition: unknown): Promise<unknown> {
  return mergeHiddenConfidentialRows(await loadCampaignDefinitionRows(campaignId), definition);
}

// ── Duplication ────────────────────────────────────────────────────────────────────────────────

/** Clé lisible depuis un titre : minuscules sans accents, tirets, suffixe aléatoire. */
export function keyFromTitle(title: string, suffix = randomBytes(3).toString("hex")): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "campagne"}-${suffix}`;
}

/**
 * Document de la copie : même structure, règles, confidentialité et messages ; nouveau titre, clé
 * et dates. `keepAssignments` garde les destinataires (sans échéance propre : les dates sont
 * nouvelles) ; sinon un destinataire par questionnaire, nommé comme lui. Pur.
 */
export function duplicateDefinition(source: CampaignDefinition, input: DuplicateCampaignInput, key: string): CampaignDefinition {
  const data = duplicateCampaignSchema.parse(input);
  const { periodStart, periodEnd, dueAt, ...rest } = source.campaign;
  const pick = (next: string | null | undefined, prev: string | undefined) => (next === undefined ? prev : (next ?? undefined));
  const dates = {
    periodStart: pick(data.periodStart, periodStart),
    periodEnd: pick(data.periodEnd, periodEnd),
    dueAt: pick(data.dueAt, dueAt),
  };
  return {
    ...source,
    campaign: {
      ...rest,
      key,
      title: data.title,
      ...Object.fromEntries(Object.entries(dates).filter(([, v]) => v !== undefined)),
    },
    forms: source.forms.map((f) => ({
      ...f,
      assignments: data.keepAssignments ? f.assignments.map((a) => ({ key: a.key, label: a.label })) : [{ key: f.key, label: f.title }],
    })),
  };
}

/**
 * Duplique une campagne en brouillon dans l'église de la source : export complet, ajustement, puis
 * import en création (l'auteur devient gestionnaire). Rien d'autre n'est copié : ni réponse, ni
 * fichier, ni répondant, ni lien, ni validation, ni historique. Droits vérifiés par l'appelant
 * (gestionnaire de la source et `campaigns:manage` dans son église).
 */
export async function duplicateCampaign(
  sourceId: string,
  input: DuplicateCampaignInput,
  actor: ImportActor,
  churchId: string
): Promise<ImportPreview> {
  const { definition } = await exportCampaignDefinition(sourceId);
  // Clé neuve, jamais celle d'une campagne existante : l'import mettrait sinon cette autre à jour.
  let key: string | null = null;
  for (let i = 0; i < 5 && !key; i++) {
    const candidate = keyFromTitle(input.title);
    const taken = await prisma.campaign.findUnique({ where: { churchId_key: { churchId, key: candidate } }, select: { id: true } });
    if (!taken) key = candidate;
  }
  if (!key) throw new ApiError(409, "La copie n'a pas pu être créée : réessayez");
  const copy = duplicateDefinition(definition, input, key);
  const created = await importCampaign({ churchId, definition: copy, dryRun: false, actor, canCreate: true });
  if (created.campaign.action !== "create") throw new ApiError(409, "La copie n'a pas pu être créée : réessayez");
  await logAudit({
    userId: actor.userId,
    churchId,
    action: "CREATE",
    entityType: "Campaign",
    entityId: created.campaignId ?? key,
    details: { duplicatedFrom: sourceId, keepAssignments: input.keepAssignments ?? true },
  });
  return created;
}
