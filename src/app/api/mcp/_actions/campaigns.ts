import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { withAuditContext } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import type { CampaignStatusAction, ImportPreview } from "@/modules/campaigns";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/schemas";
import { CHANGED, EXPIRED, confirmInput, fingerprint, previewText, refusal, type ActionContext, type ActionResult, type McpActionDef } from "./common";

/**
 * Campagnes de collecte (spec 090, lot 5) : importer une définition et changer l'état d'une
 * campagne, en aperçu puis confirmation. Même code et mêmes droits que les routes de l'écran :
 * créer exige `campaigns:manage`, réimporter ou changer l'état exige d'être gestionnaire de la
 * campagne (sinon « introuvable », comme une absence). Une empreinte de l'état lu à l'aperçu est
 * revérifiée à la confirmation. Les services journalisent eux-mêmes, ici « via l'assistant IA ».
 * Aucun aperçu ne montre d'adresse email (les répondants sont comptés).
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
  // Aperçu seul (`dryRun`) : le droit de créer est vérifié à part, avant.
  const preview = await importCampaign({ churchId: ctx.churchId, definition: payload.definition, dryRun: true, actor: await actorOf(ctx), canCreate: true });
  return { existing, preview: { ...preview, applied: undefined } };
}

export async function previewImportCampaign(input: z.infer<typeof importCampaignInput>, ctx: ActionContext): Promise<ActionResult> {
  const key = peekKey(input.definition);
  const right = await importDenied(ctx, key);
  if ("denied" in right) return refusal(right.denied);
  let preview: ImportPreview;
  try {
    preview = await (await campaigns()).importCampaign({ churchId: ctx.churchId, definition: input.definition, dryRun: true, actor: await actorOf(ctx), canCreate: right.canCreate });
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  if (preview.blocked.length) {
    return refusal(
      `Import refusé : des modifications feraient perdre des réponses déjà saisies — ${preview.blocked
        .slice(0, 20)
        .map((b) => [b.formKey, b.code].filter(Boolean).join(".") + (b.formKey || b.code ? " : " : "") + b.reason)
        .join(" ; ")}.`
    );
  }
  const payload: ImportPayload = { definition: JSON.parse(JSON.stringify(input.definition)), key: preview.campaign.key };
  const state = await importState(ctx, payload);
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
    if (fingerprint(await importState(ctx, stored.payload)) !== stored.fp) return refusal(CHANGED);
    const actor = await actorOf(ctx);
    const done = await withAuditContext({ via: "mcp" }, () =>
      campaigns().then((m) => m.importCampaign({ churchId: ctx.churchId, definition: stored.payload.definition, dryRun: false, actor, canCreate: right.canCreate }))
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
  if (op.to === "OPEN" && c._count.assignments === 0) return refusal("La campagne n'a aucun questionnaire à remplir.");
  const lines = [`${op.label} « ${c.title} » (clé ${c.key}) : « ${from} » → « ${CAMPAIGN_STATUS_LABELS[op.to]} ».`];
  if (op.to === "OPEN") {
    lines.push(
      c.openedAt
        ? "La saisie reprend ; les répondants ne sont pas prévenus de nouveau."
        : `Première ouverture : les répondants des ${c._count.assignments} questionnaire(s) reçoivent leur lien par notification ou par email.`
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
];
