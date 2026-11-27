import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { withAuditContext } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import type { CampaignStatusAction, ImportPreview } from "@/modules/campaigns";
import {
  ASSIGNMENT_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  COMPARATORS,
  FILE_ACCEPT,
  FILE_REQUEST_STATUSES,
  FILE_RETENTION_DAYS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  MESSAGE_KINDS,
  MESSAGE_PLACEHOLDERS,
  QUALIFIERS,
  QUALIFIER_LABELS,
  DEFAULT_QUALIFIERS,
  campaignDefinitionSchema,
  flattenItems,
  storedFormDefinitionSchema,
} from "@/modules/campaigns/schemas";
import { CHANGED, EXPIRED, confirmInput, fingerprint, previewText, refusal, type ActionContext, type ActionResult, type McpActionDef } from "./common";

/**
 * Campagnes de collecte (spec 090, lot 5) : importer une définition et changer l'état d'une
 * campagne, en aperçu puis confirmation. Même code et mêmes droits que les routes de l'écran :
 * créer exige `campaigns:manage`, réimporter ou changer l'état exige d'être gestionnaire de la
 * campagne (sinon « introuvable », comme une absence). Une empreinte de l'état lu à l'aperçu est
 * revérifiée à la confirmation. Les services journalisent eux-mêmes, ici « via l'assistant IA ».
 * Aucun aperçu ne montre d'adresse email (les répondants sont comptés).
 *
 * Spec 091 : lectures `campaign_import_contract` (format, sans donnée), `campaign_structure` et
 * `export_campaign_definition` (questionnaires confidentiels réduits à leur état ou omis), et
 * action `reopen_contribution`. À l'import d'une campagne existante, les questionnaires
 * confidentiels, que l'assistant ne voit pas, sont réintégrés d'office (`mergeHiddenConfidential`) :
 * il ne peut ni les lire, ni les modifier, ni les supprimer. Jamais de valeur de réponse, de nom ou
 * contenu de fichier, de nom ou d'adresse de répondant, ni de lien personnel.
 */

const campaigns = () => import("@/modules/campaigns");
const auth = () => import("@/modules/campaigns/auth");

const NOT_FOUND = "Campagne de collecte introuvable dans cette église.";
const NOT_CREATOR = "Créer une campagne de collecte est réservé à l'Admin et au Super Admin de l'église (campaigns:manage).";

const link = (campaignId?: string | null) => `${publicOrigin()}/collectes${campaignId ? `/${campaignId}` : ""}`;
const actorOf = async (ctx: ActionContext) => {
  const { userActor } = await auth();
  return { userId: ctx.session.user.id, name: userActor(ctx.session).name };
};

/** Clé de la campagne, lue avant validation complète pour décider du droit requis (comme la route). */
function peekKey(definition: unknown): string | null {
  const key = (definition as { campaign?: { key?: unknown } } | null)?.campaign?.key;
  return typeof key === "string" ? key : null;
}

const campaignState = (churchId: string, key: string) =>
  prisma.campaign.findUnique({
    where: { churchId_key: { churchId, key } },
    select: { id: true, status: true, definitionHash: true, updatedAt: true },
  });

/** Droit d'importer : gestionnaire si la campagne existe, `campaigns:manage` sinon. Texte du refus, ou null. */
async function importDenied(ctx: ActionContext, key: string | null): Promise<{ denied: string } | { canCreate: boolean }> {
  const { findCampaignByKey } = await campaigns();
  const { hasCampaignsManage, isCampaignManager, isChurchMember } = await auth();
  if (!isChurchMember(ctx.session, ctx.churchId)) return { denied: NOT_FOUND };
  const existing = key ? await findCampaignByKey(ctx.churchId, key) : null;
  const canCreate = await hasCampaignsManage(ctx.session, ctx.churchId);
  if (existing) return (await isCampaignManager(ctx.session, existing)) ? { canCreate } : { denied: NOT_FOUND };
  return canCreate ? { canCreate } : { denied: NOT_CREATOR };
}

const ACTION_LABEL: Record<string, string> = { create: "créé", update: "modifié", unchanged: "inchangé", remove: "retiré" };

/** Résumé de l'aperçu sans aucune adresse ni nom de répondant. */
function importLines(p: ImportPreview, existingStatus: string | null): string[] {
  const head =
    p.campaign.action === "create"
      ? `Créer la campagne « ${p.campaign.title} » (clé ${p.campaign.key}) en brouillon`
      : `${p.campaign.action === "update" ? "Mettre à jour" : "Réimporter sans changement"} la campagne « ${p.campaign.title} » (clé ${p.campaign.key}), actuellement « ${CAMPAIGN_STATUS_LABELS[existingStatus as keyof typeof CAMPAIGN_STATUS_LABELS] ?? existingStatus} »`;
  const forms = p.forms.map((f) => {
    const diff = [f.itemsAdded.length && `+${f.itemsAdded.length}`, f.itemsChanged.length && `~${f.itemsChanged.length}`, f.itemsRemoved.length && `-${f.itemsRemoved.length}`].filter(Boolean).join(" ");
    return `- Questionnaire « ${f.title} » (${f.key}) : ${ACTION_LABEL[f.action]}, révision ${f.revision}${diff ? `, questions ${diff}` : ""}`;
  });
  const counts = (["create", "update", "remove"] as const).map((a) => [a, p.assignments.filter((x) => x.action === a).length] as const).filter(([, n]) => n > 0);
  const lines = [
    head,
    ...forms,
    `Destinataires : ${p.assignments.length}${counts.length ? ` (${counts.map(([a, n]) => `${n} ${ACTION_LABEL[a]}(s)`).join(", ")})` : ""}`,
    `Répondants : ${p.respondents.resolved.length} compte(s) de l'église retrouvé(s)${p.respondents.unresolved.length ? `, ${p.respondents.unresolved.length} adresse(s) sans compte dans l'église, ignorée(s)` : ""} ; les répondants existants sont gardés`,
  ];
  if (existingStatus === "OPEN") lines.push("La campagne est ouverte : les répondants ajoutés reçoivent leur lien dès la confirmation.");
  return lines;
}

// ─── Import ──────────────────────────────────────────────────────────────────

export const importCampaignInput = z.object({
  definition: z.record(z.string(), z.unknown()).describe("Définition complète de la campagne (format koinonia.campaign), telle que l'écran d'import l'accepte"),
});

type ImportPayload = { definition: Record<string, unknown>; key: string };
type Stored<P> = { payload: P; fp: string };

/** État relu à l'aperçu et à la confirmation : campagne existante et aperçu recalculé. */
async function importState(ctx: ActionContext, payload: ImportPayload) {
  const { importCampaign } = await campaigns();
  const existing = await campaignState(ctx.churchId, payload.key);
  const definition = await withHidden(existing?.id ?? null, payload.definition);
  // Aperçu seul (`dryRun`) : le droit de créer est vérifié à part, avant.
  const preview = await importCampaign({ churchId: ctx.churchId, definition, dryRun: true, actor: await actorOf(ctx), canCreate: true });
  return { existing, definition, preview: { ...preview, applied: undefined } };
}

/** Campagne existante : questionnaires confidentiels (invisibles à l'assistant) réintégrés d'office. */
async function withHidden(campaignId: string | null, definition: unknown): Promise<unknown> {
  return campaignId ? (await campaigns()).mergeHiddenConfidential(campaignId, definition) : definition;
}

/** Clés des questionnaires confidentiels existants : retirés de tout résumé. */
async function confidentialKeys(campaignId: string | null): Promise<Set<string>> {
  if (!campaignId) return new Set();
  const rows = await prisma.campaignForm.findMany({ where: { campaignId, confidential: true }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

/** Aperçu sans les questionnaires confidentiels existants (ni leurs destinataires, ni leurs blocages). */
function hideConfidential(p: ImportPreview, hidden: Set<string>): ImportPreview {
  if (hidden.size === 0) return p;
  return {
    ...p,
    forms: p.forms.filter((f) => !hidden.has(f.key)),
    assignments: p.assignments.filter((a) => !hidden.has(a.formKey)),
    blocked: p.blocked.filter((b) => !b.formKey || !hidden.has(b.formKey)),
  };
}

export async function previewImportCampaign(input: z.infer<typeof importCampaignInput>, ctx: ActionContext): Promise<ActionResult> {
  const key = peekKey(input.definition);
  const right = await importDenied(ctx, key);
  if ("denied" in right) return refusal(right.denied);
  let preview: ImportPreview;
  let hidden: Set<string>;
  try {
    const existing = key ? await campaignState(ctx.churchId, key) : null;
    hidden = await confidentialKeys(existing?.id ?? null);
    const definition = await withHidden(existing?.id ?? null, input.definition);
    preview = await (await campaigns()).importCampaign({ churchId: ctx.churchId, definition, dryRun: true, actor: await actorOf(ctx), canCreate: right.canCreate });
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const fullPreview = preview;
  preview = hideConfidential(preview, hidden);
  if (fullPreview.blocked.length) {
    if (!preview.blocked.length) return refusal("Import refusé : il ferait perdre des réponses déjà saisies.");
    return refusal(
      `Import refusé : des modifications feraient perdre des réponses déjà saisies — ${preview.blocked
        .slice(0, 20)
        .map((b) => [b.formKey, b.code].filter(Boolean).join(".") + (b.formKey || b.code ? " : " : "") + b.reason)
        .join(" ; ")}.`
    );
  }
  const payload: ImportPayload = { definition: JSON.parse(JSON.stringify(input.definition)), key: preview.campaign.key };
  let state: Awaited<ReturnType<typeof importState>>;
  try {
    state = await importState(ctx, payload);
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const stored: Stored<ImportPayload> = { payload, fp: fingerprint(state) };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "import_campaign", stored as unknown as Prisma.InputJsonValue);
  return {
    text: previewText(importLines(preview, state.existing?.status ?? null), token),
    structured: {
      done: false,
      action: "import_campaign",
      confirmation: token,
      expiresAt: expiresAt.toISOString(),
      campaign: preview.campaign,
      forms: preview.forms.map((f) => ({ key: f.key, title: f.title, action: f.action, revision: f.revision, added: f.itemsAdded.length, changed: f.itemsChanged.length, removed: f.itemsRemoved.length })),
      assignments: preview.assignments.length,
      respondents: { resolved: preview.respondents.resolved.length, unresolved: preview.respondents.unresolved.length },
    },
  };
}

export async function confirmImportCampaign(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  // Payload effacé dès sa lecture : la définition contient les adresses des répondants.
  const stored = (await consumeConfirmation(ctx.grantId, "import_campaign", input.confirmation, new Date(), { erase: true })) as Stored<ImportPayload> | null;
  if (!stored) return refusal(EXPIRED);
  const right = await importDenied(ctx, stored.payload.key);
  if ("denied" in right) return refusal(right.denied);
  try {
    const state = await importState(ctx, stored.payload);
    if (fingerprint(state) !== stored.fp) return refusal(CHANGED);
    const actor = await actorOf(ctx);
    const done = await withAuditContext({ via: "mcp" }, () =>
      campaigns().then((m) => m.importCampaign({ churchId: ctx.churchId, definition: state.definition, dryRun: false, actor, canCreate: right.canCreate }))
    );
    const url = link(done.campaignId);
    const what = done.campaign.action === "create" ? "créée en brouillon" : done.campaign.action === "update" ? "mise à jour" : "inchangée";
    return {
      text: `Campagne « ${done.campaign.title} » (clé ${done.campaign.key}) ${what}.\nVoir dans Koinonia : ${url}`,
      structured: { done: true, action: "import_campaign", campaignId: done.campaignId, campaign: done.campaign, link: url },
    };
  } catch (error) {
    if (error instanceof ApiError) return refusal(`${error.message} Rien n'est fait : refaites l'aperçu.`);
    throw error;
  }
}

// ─── État ────────────────────────────────────────────────────────────────────

const STATUS_OPS: Record<CampaignStatusAction, { from: string[]; to: "OPEN" | "CLOSED"; label: string }> = {
  open: { from: ["DRAFT", "CLOSED"], to: "OPEN", label: "Ouvrir la campagne" },
  close: { from: ["OPEN"], to: "CLOSED", label: "Clôturer la campagne" },
  reopen: { from: ["CLOSED"], to: "OPEN", label: "Rouvrir la campagne" },
};

export const setCampaignStatusInput = z.object({
  campaign: z.string().trim().min(1).max(100).describe("Identifiant ou clé de la campagne (voir campaigns_list)"),
  op: z.enum(["open", "close", "reopen"]).describe("open : ouvrir à la saisie ; close : clôturer ; reopen : rouvrir une campagne clôturée"),
});

type StatusPayload = { campaignId: string; op: CampaignStatusAction };

/** Campagne de l'église de la connexion, par identifiant ou clé, dont le compte est gestionnaire. */
async function managedCampaign(ctx: ActionContext, ref: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { churchId: ctx.churchId, OR: [{ id: ref }, { key: ref }] },
    select: { id: true, churchId: true, key: true, title: true, status: true, openedAt: true, updatedAt: true, _count: { select: { assignments: true } } },
  });
  if (!campaign) return null;
  return (await (await auth()).isCampaignManager(ctx.session, campaign)) ? campaign : null;
}

const statusState = (c: { status: string; openedAt: Date | null; updatedAt: Date; _count: { assignments: number } }) => ({
  status: c.status,
  openedAt: c.openedAt,
  updatedAt: c.updatedAt,
  assignments: c._count.assignments,
});

export async function previewSetCampaignStatus(input: z.infer<typeof setCampaignStatusInput>, ctx: ActionContext): Promise<ActionResult> {
  const c = await managedCampaign(ctx, input.campaign);
  if (!c) return refusal(NOT_FOUND);
  const op = STATUS_OPS[input.op];
  const from = CAMPAIGN_STATUS_LABELS[c.status];
  if (!op.from.includes(c.status)) return refusal(`Impossible : la campagne « ${c.title} » est « ${from} ».`);
  if (op.to === "OPEN" && c._count.assignments === 0) return refusal("La campagne n'a aucun destinataire.");
  if (op.to === "OPEN") {
    const { assignmentsWithoutRespondent, missingRespondentsMessage } = await campaigns();
    const missing = await assignmentsWithoutRespondent(c.id, c.churchId);
    if (missing.length > 0) return refusal(missingRespondentsMessage(missing));
  }
  const lines = [`${op.label} « ${c.title} » (clé ${c.key}) : « ${from} » → « ${CAMPAIGN_STATUS_LABELS[op.to]} ».`];
  if (op.to === "OPEN") {
    lines.push(
      c.openedAt
        ? "La saisie reprend ; les répondants ne sont pas prévenus de nouveau."
        : `Première ouverture : les répondants des ${c._count.assignments} destinataire(s) (un questionnaire peut en avoir plusieurs) reçoivent leur lien par notification ou par email.`
    );
  } else {
    lines.push("La saisie s'arrête ; les liens personnels sans compte cessent de fonctionner. La campagne pourra être rouverte.");
  }
  const payload: StatusPayload = { campaignId: c.id, op: input.op };
  const stored: Stored<StatusPayload> = { payload, fp: fingerprint(statusState(c)) };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "set_campaign_status", stored as unknown as Prisma.InputJsonValue);
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "set_campaign_status", confirmation: token, expiresAt: expiresAt.toISOString(), campaignId: c.id, from: c.status, to: op.to },
  };
}

export async function confirmSetCampaignStatus(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const stored = (await consumeConfirmation(ctx.grantId, "set_campaign_status", input.confirmation)) as Stored<StatusPayload> | null;
  if (!stored) return refusal(EXPIRED);
  const c = await managedCampaign(ctx, stored.payload.campaignId);
  if (!c) return refusal(NOT_FOUND);
  if (fingerprint(statusState(c)) !== stored.fp) return refusal(CHANGED);
  try {
    const actor = await actorOf(ctx);
    const updated = await withAuditContext({ via: "mcp" }, () => campaigns().then((m) => m.changeCampaignStatus(c.id, stored.payload.op, actor)));
    const status = updated?.status ?? STATUS_OPS[stored.payload.op].to;
    const url = link(c.id);
    return {
      text: `Campagne « ${c.title} » : ${CAMPAIGN_STATUS_LABELS[status]}.\nVoir dans Koinonia : ${url}`,
      structured: { done: true, action: "set_campaign_status", campaignId: c.id, status, link: url },
    };
  } catch (error) {
    if (error instanceof ApiError) return refusal(`${error.message} Rien n'est fait : refaites l'aperçu.`);
    throw error;
  }
}

// ─── Contrat d'import (lecture, sans donnée) ─────────────────────────────────

/** Exemple minimal valide du format v1 (vérifié par les tests). */
export const CAMPAIGN_IMPORT_EXAMPLE = {
  format: "koinonia.campaign",
  version: 1,
  campaign: {
    key: "bilan-2026",
    title: "Bilan annuel 2026",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    dueAt: "2027-01-31",
    messages: { initial: "Bonjour,\n\nMerci de remplir le {{campagne}} pour {{destinataire}} avant le {{echeance}}.\n\n👉 {{lien}}" },
  },
  forms: [
    {
      key: "accueil",
      title: "Département Accueil",
      assignments: [{ key: "accueil", label: "Accueil" }],
      sections: [
        {
          key: "effectifs",
          title: "Effectifs",
          items: [
            { code: "ACC_STAR", type: "integer", label: "Nombre de STAR actifs", required: true, min: 0 },
            { code: "ACC_NOUVEAUX", type: "integer", label: "Dont nouveaux cette année", min: 0 },
          ],
        },
      ],
    },
  ],
  rules: [{ key: "nouveaux_inclus", check: { lte: ["ACC_NOUVEAUX", "ACC_STAR"] }, message: "Les nouveaux ne peuvent dépasser le total des STAR" }],
} as const;

let contractCache: Record<string, unknown> | null = null;

/** Contrat du format `koinonia.campaign` v1, généré depuis le schéma de validation. Pur. */
export function campaignImportContract(): Record<string, unknown> {
  if (contractCache) return contractCache;
  let jsonSchema: unknown;
  try {
    jsonSchema = z.toJSONSchema(campaignDefinitionSchema, { io: "input", unrepresentable: "any" });
  } catch {
    jsonSchema = null;
  }
  contractCache = {
    format: "koinonia.campaign",
    version: 1,
    jsonSchema,
    itemTypes: ITEM_TYPES.map((t) => ({ type: t, label: ITEM_TYPE_LABELS[t] })),
    qualifiers: QUALIFIERS.map((q) => ({ key: q, label: QUALIFIER_LABELS[q] })),
    defaultQualifiers: DEFAULT_QUALIFIERS,
    fileRequest: { statuses: FILE_REQUEST_STATUSES, accept: FILE_ACCEPT },
    rules: {
      comparators: COMPARATORS,
      shapes: [
        "{ <comparateur>: [opérande, opérande] } — comparateurs lte, lt, gte, gt, eq, neq",
        "{ chain_gte: [code, code, …] } / { chain_lte: [...] } — suite décroissante / croissante",
        "{ implies: [condition, conséquence] }, { all: [contrôle, …] }",
        "Opérande : code d'une question nombre ou oui/non de premier niveau, nombre, booléen, ou { sum: [opérande, …] }",
      ],
    },
    messages: { kinds: MESSAGE_KINDS, placeholders: MESSAGE_PLACEHOLDERS.map((p) => ({ key: `{{${p.key}}}`, description: p.description, kinds: p.kinds })) },
    constraints: [
      "Clés (campagne, questionnaire, destinataire, section, règle) : lettres, chiffres, « _ . - », 80 caractères au plus, uniques à leur niveau.",
      "Codes de question : lettre puis lettres, chiffres ou _, 40 caractères au plus, uniques dans toute la campagne (champs de groupe compris).",
      "Dates : jour AAAA-MM-JJ ; une échéance jour vaut la fin de cette journée à Paris, ou un instant ISO avec décalage.",
      `Conservation des fichiers : ${FILE_RETENTION_DAYS.min} à ${FILE_RETENTION_DAYS.max} jours (${FILE_RETENTION_DAYS.default} par défaut).`,
      "Réimporter la même clé met la campagne à jour ; l'import est refusé s'il ferait perdre des réponses ou des fichiers.",
      "Les questionnaires confidentiels existants ne sont ni lus ni modifiables par l'assistant : ils sont conservés d'office.",
      "Répondants : adresses email de comptes de l'église (facultatif) ; l'assistant ne les voit jamais en retour.",
    ],
    example: CAMPAIGN_IMPORT_EXAMPLE,
  };
  return contractCache;
}

async function readImportContract(): Promise<ActionResult> {
  const c = campaignImportContract();
  return {
    text: `Format koinonia.campaign v1 : ${ITEM_TYPES.length} types de question (${ITEM_TYPES.join(", ")}), qualificatifs ${QUALIFIERS.join(", ")}, contrôles ${COMPARATORS.join(", ")}, chain_gte, chain_lte, implies, all. Schéma JSON complet, contraintes et exemple minimal dans le contenu structuré. Composer la définition puis l'envoyer à import_campaign_preview.`,
    structured: c,
  };
}

// ─── Structure et définition (lecture) ───────────────────────────────────────

const campaignRefInput = z.object({
  campaign: z.string().trim().min(1).max(100).describe("Identifiant ou clé de la campagne (voir campaigns_list)"),
});

async function readStructure(input: z.infer<typeof campaignRefInput>, ctx: ActionContext): Promise<ActionResult> {
  const c = await managedCampaign(ctx, input.campaign);
  if (!c) return refusal(NOT_FOUND);
  const full = await prisma.campaign.findUnique({
    where: { id: c.id },
    select: {
      dueAt: true,
      forms: {
        orderBy: { position: "asc" },
        select: {
          key: true,
          title: true,
          confidential: true,
          revision: true,
          definition: true,
          assignments: { orderBy: { position: "asc" }, select: { id: true, key: true, label: true, status: true, dueAt: true } },
        },
      },
    },
  });
  if (!full) return refusal(NOT_FOUND);
  const forms = full.forms.map((f) => {
    const assignments = f.assignments.map((a) => ({ id: a.id, key: a.key, label: a.label, status: a.status, dueAt: (a.dueAt ?? full.dueAt)?.toISOString() ?? null }));
    if (f.confidential) return { key: f.key, title: f.title, confidential: true, assignments };
    const stored = storedFormDefinitionSchema.safeParse(f.definition);
    const sections = stored.success ? stored.data.sections : [];
    return {
      key: f.key,
      title: f.title,
      confidential: false,
      revision: f.revision,
      assignments,
      sections: sections.map((s) => ({
        key: s.key,
        title: s.title,
        items: flattenItems([s]).map((i) => ({ code: i.code, type: i.type, label: i.label, required: !!i.required })),
      })),
    };
  });
  const lines = [
    `Campagne « ${c.title} » (clé ${c.key}), ${CAMPAIGN_STATUS_LABELS[c.status]}.`,
    ...forms.map((f) =>
      f.confidential
        ? `- « ${f.title} » (${f.key}) : confidentiel, contenu non communiqué — ${f.assignments.map((a) => `${a.label} : ${ASSIGNMENT_STATUS_LABELS[a.status]}`).join(" ; ")}`
        : `- « ${f.title} » (${f.key}), ${f.sections!.reduce((n, s) => n + s.items.length, 0)} question(s) — ${f.assignments.map((a) => `${a.label} : ${ASSIGNMENT_STATUS_LABELS[a.status]}`).join(" ; ")}`
    ),
  ];
  return { text: lines.join("\n"), structured: { campaignId: c.id, key: c.key, title: c.title, status: c.status, forms } };
}

async function readDefinition(input: z.infer<typeof campaignRefInput>, ctx: ActionContext): Promise<ActionResult> {
  const c = await managedCampaign(ctx, input.campaign);
  if (!c) return refusal(NOT_FOUND);
  try {
    const { definition, omittedForms, omittedRules } = await (await campaigns()).exportCampaignDefinition(c.id, { omitConfidential: true });
    const note = omittedForms
      ? ` ${omittedForms} questionnaire(s) confidentiel(s) et ${omittedRules} contrôle(s) qui les lisent sont omis : ils sont conservés d'office si cette définition est réimportée.`
      : "";
    return {
      text: `Définition de « ${c.title} » (format koinonia.campaign v1, sans répondant).${note} Modifiable puis réimportable par import_campaign_preview (même clé : mise à jour).`,
      structured: { campaignId: c.id, omittedForms, omittedRules, definition },
    };
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
}

// ─── Rouvrir une contribution ────────────────────────────────────────────────

export const reopenContributionInput = z.object({
  assignment: z.string().trim().min(1).max(64).describe("Identifiant de la contribution (destinataire), voir campaign_structure"),
  reason: z.string().trim().max(2000).optional().describe("Motif facultatif, affiché dans le questionnaire (jamais dans la notification)"),
});

type ReopenPayload = { assignmentId: string; reason: string | null };

/** Contribution de l'église de la connexion dont le compte est gestionnaire. */
async function managedAssignment(ctx: ActionContext, assignmentId: string) {
  const access = await (await auth()).getAssignmentAccess(ctx.session, assignmentId);
  if (!access || access.role !== "manager" || access.assignment.churchId !== ctx.churchId) return null;
  const row = await prisma.campaignAssignment.findUnique({
    where: { id: assignmentId },
    select: { label: true, status: true, submittedAt: true, reviewedAt: true, form: { select: { title: true } }, campaign: { select: { id: true, title: true, status: true } } },
  });
  return row ? { access, row } : null;
}

const reopenState = (r: { status: string; submittedAt: Date | null; reviewedAt: Date | null; campaign: { status: string } }) => ({
  status: r.status,
  submittedAt: r.submittedAt,
  reviewedAt: r.reviewedAt,
  campaign: r.campaign.status,
});

export async function previewReopenContribution(input: z.infer<typeof reopenContributionInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await managedAssignment(ctx, input.assignment);
  if (!found) return refusal("Contribution introuvable dans cette église.");
  const { row } = found;
  if (row.campaign.status !== "OPEN") return refusal(`Impossible : la campagne « ${row.campaign.title} » n'est pas ouverte.`);
  if (row.status !== "SUBMITTED") {
    return refusal(
      row.status === "VALIDATED"
        ? "Cette contribution est validée : annulez d'abord la validation depuis Koinonia."
        : `Seule une contribution soumise peut être rouverte (elle est « ${ASSIGNMENT_STATUS_LABELS[row.status]} »).`
    );
  }
  const reason = input.reason?.trim() || null;
  const lines = [
    `Rouvrir la contribution « ${row.form.title} › ${row.label} » (campagne « ${row.campaign.title} ») : « Soumis » → « En cours ».`,
    "Les réponses et fichiers déjà saisis sont conservés ; une nouvelle soumission sera nécessaire.",
    `Les répondants sont prévenus${reason ? " ; le motif s'affichera dans le questionnaire, pas dans la notification" : ""}.`,
  ];
  const stored: Stored<ReopenPayload> = { payload: { assignmentId: input.assignment, reason }, fp: fingerprint(reopenState(row)) };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "reopen_contribution", stored as unknown as Prisma.InputJsonValue);
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "reopen_contribution", confirmation: token, expiresAt: expiresAt.toISOString(), assignmentId: input.assignment, from: row.status, to: "IN_PROGRESS" },
  };
}

export async function confirmReopenContribution(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const stored = (await consumeConfirmation(ctx.grantId, "reopen_contribution", input.confirmation)) as Stored<ReopenPayload> | null;
  if (!stored) return refusal(EXPIRED);
  const found = await managedAssignment(ctx, stored.payload.assignmentId);
  if (!found) return refusal("Contribution introuvable dans cette église.");
  if (fingerprint(reopenState(found.row)) !== stored.fp) return refusal(CHANGED);
  const access = found.access as typeof found.access & { role: "manager" };
  try {
    await withAuditContext({ via: "mcp" }, () => campaigns().then((m) => m.reopenAssignment(access, stored.payload.reason)));
    const url = link(found.row.campaign.id);
    return {
      text: `Contribution « ${found.row.form.title} › ${found.row.label} » rouverte : « En cours ».\nVoir dans Koinonia : ${url}`,
      structured: { done: true, action: "reopen_contribution", assignmentId: stored.payload.assignmentId, status: "IN_PROGRESS", link: url },
    };
  } catch (error) {
    if (error instanceof ApiError) return refusal(`${error.message} Rien n'est fait : refaites l'aperçu.`);
    throw error;
  }
}

/** Proposé à un gestionnaire de campagne de l'église (prédicat calculé côté serveur) ; revérifié à chaque appel. */
const available = (viewer: ActionContext["viewer"]) =>
  viewer.modules.includes("campaigns") && (viewer.isSuperAdmin || viewer.permissions.includes("campaigns:manage") || viewer.predicates.includes("campaignManager"));

export const CAMPAIGN_ACTIONS: McpActionDef[] = [
  {
    name: "import_campaign_preview",
    action: "import_campaign",
    kind: "preview",
    description:
      "Aperçu : créer (en brouillon) ou mettre à jour une campagne de collecte depuis sa définition JSON (format koinonia.campaign), comme l'écran d'import. N'enregistre rien : résumé des questionnaires, destinataires et répondants (comptés, sans adresse) et un jeton. Refusé si une modification ferait perdre des réponses. Créer est réservé à campaigns:manage ; réimporter, aux gestionnaires de la campagne. Montrez le résumé et attendez l'accord explicite de la personne avant import_campaign_confirm.",
    input: importCampaignInput,
    available,
    run: previewImportCampaign as McpActionDef["run"],
  },
  {
    name: "import_campaign_confirm",
    action: "import_campaign",
    kind: "confirm",
    description: "Confirme et applique l'import préparé par import_campaign_preview, avec son jeton, après l'accord explicite de la personne. Refusé si la campagne a changé depuis l'aperçu.",
    input: confirmInput,
    available,
    run: confirmImportCampaign as McpActionDef["run"],
  },
  {
    name: "set_campaign_status_preview",
    action: "set_campaign_status",
    kind: "preview",
    description:
      "Aperçu : ouvrir à la saisie, clôturer ou rouvrir une campagne de collecte que la personne gère. N'enregistre rien : résumé et un jeton (la première ouverture prévient les répondants). Montrez le résumé et attendez l'accord explicite de la personne avant set_campaign_status_confirm.",
    input: setCampaignStatusInput,
    available,
    run: previewSetCampaignStatus as McpActionDef["run"],
  },
  {
    name: "set_campaign_status_confirm",
    action: "set_campaign_status",
    kind: "confirm",
    description: "Confirme et change l'état de la campagne préparé par set_campaign_status_preview, avec son jeton, après l'accord explicite de la personne.",
    input: confirmInput,
    available,
    run: confirmSetCampaignStatus as McpActionDef["run"],
  },
  {
    name: "campaign_import_contract",
    action: "campaign_import_contract",
    kind: "read",
    description:
      "Contrat du format koinonia.campaign v1, généré depuis le schéma de validation : schéma JSON complet, types de question, qualificatifs, formes de contrôles, variables des modèles de messages, contraintes et exemple minimal valide. Aucune donnée d'église. À lire avant de composer une définition pour import_campaign_preview.",
    input: z.object({}),
    available,
    run: readImportContract as McpActionDef["run"],
  },
  {
    name: "campaign_structure",
    action: "campaign_structure",
    kind: "read",
    description:
      "Structure d'une campagne de collecte que la personne gère : questionnaires, sections et questions (code, type, libellé, obligatoire), destinataires avec identifiant, état et échéance. Un questionnaire confidentiel ne montre que ses destinataires et leur état. Jamais de réponse, de fichier ni de répondant.",
    input: campaignRefInput,
    available,
    run: readStructure as McpActionDef["run"],
  },
  {
    name: "export_campaign_definition",
    action: "export_campaign_definition",
    kind: "read",
    description:
      "Définition JSON (koinonia.campaign v1) d'une campagne que la personne gère, réimportable par import_campaign_preview : questionnaires, destinataires, contrôles, modèles de messages. Sans répondant ni réponse ; les questionnaires confidentiels et les contrôles qui les lisent sont omis (et conservés d'office au réimport).",
    input: campaignRefInput,
    available,
    run: readDefinition as McpActionDef["run"],
  },
  {
    name: "reopen_contribution_preview",
    action: "reopen_contribution",
    kind: "preview",
    description:
      "Aperçu : rouvrir une contribution soumise d'une campagne ouverte que la personne gère (« Soumis » → « En cours », réponses et fichiers conservés, nouvelle soumission nécessaire, répondants prévenus sans le motif). N'enregistre rien : résumé et un jeton. Montrez le résumé et attendez l'accord explicite de la personne avant reopen_contribution_confirm.",
    input: reopenContributionInput,
    available,
    run: previewReopenContribution as McpActionDef["run"],
  },
  {
    name: "reopen_contribution_confirm",
    action: "reopen_contribution",
    kind: "confirm",
    description: "Confirme et rouvre la contribution préparée par reopen_contribution_preview, avec son jeton, après l'accord explicite de la personne. Refusé si la contribution a changé depuis l'aperçu.",
    input: confirmInput,
    available,
    run: confirmReopenContribution as McpActionDef["run"],
  },
];
