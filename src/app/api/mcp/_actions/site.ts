import { z } from "zod";
import {
  RichTextError,
  assetIdsOf,
  backgroundSchema,
  blockSchema,
  contrastIssues,
  describeSite,
  describeSiteText,
  explainIssues,
  SITE_SUBJECTS,
  pageSchema,
  parseRichText,
  richTextToMarkdown,
  sectionSchema,
  siteDocumentSchema,
  themeSchema,
  type SiteDocument,
} from "@/modules/ticketing/schemas";
import { ApiError } from "@/lib/api-utils";
import { safeFetchImage } from "@/lib/safe-fetch";
import { type ActionContext, type ActionResult, type McpActionDef, refusal } from "./common";
import { eventAction, eventFor, eventRef, type Prepared } from "./ticketing";

/**
 * Site d'événement par l'assistant (spec 084, lot 4) : lecture du document avec ses identifiants
 * (pages par `slug`, bandes et blocs par rang à partir de 0), modification du thème, des pages, des
 * bandes et des blocs, publication, et demande de domaine dédié. Mêmes règles que l'éditeur : chaque
 * aperçu valide le **document complet** (schéma, liens, lisibilité) et refuse dès l'aperçu ; la
 * confirmation repasse par `saveDraft` (qui revérifie tout, dont l'appartenance des images). Pas de
 * téléversement : seules les images déjà présentes sur le site sont référencées. Le texte riche est
 * fourni en Markdown restreint. Rôle `site` (Organisateur, Communication) ; le domaine engage
 * l'église : rôle `configure` (Organisateur).
 */

const ticketing = () => import("@/modules/ticketing");
const readAvailable = (viewer: ActionContext["viewer"]) => viewer.modules.includes("ticketing") && viewer.predicates.includes("ticketing");
const previewDesc = (what: string) => `Aperçu : ${what}. N'enregistre rien. Montrez le résumé et attendez l'accord explicite de la personne avant l'outil de confirmation.`;
const confirmDesc = (what: string) => `Confirme et exécute : ${what}, avec le jeton de l'aperçu, après l'accord explicite de la personne.`;
const jsonify = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ─── Lecture ─────────────────────────────────────────────────────────────────

const eventInput = z.object({ event: eventRef });

/** Contenu complet d'un bloc pour l'assistant : JSON compact, ou Markdown pour un texte riche. */
function blockText(b: { kind: string; block: number; markdown?: string } & Record<string, unknown>): string {
  const { block: _rank, markdown, ...rest } = b;
  if (b.kind === "richText") return `richText\n${(markdown ?? "").split("\n").map((l) => `      ${l}`).join("\n")}`;
  return JSON.stringify(rest);
}

async function readSite(input: z.infer<typeof eventInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "site");
  if (typeof found === "string") return refusal(found);
  const m = await ticketing();
  const site = await m.getSite(found.id);
  // Le domaine n'est montré qu'à qui peut le gérer (rôle `configure`).
  const domain = m.canDo(found.access, "configure") ? await m.getDomain(found.id) : null;
  const pages = site.draft.pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    kind: p.kind,
    inMenu: p.inMenu,
    sections: p.sections.map((s, band) => ({
      band,
      background: s.background,
      textColor: s.textColor,
      blocks: s.blocks.map((b, block) => ({ block, ...b, ...(b.kind === "richText" ? { markdown: richTextToMarkdown(b.content) } : {}) })),
    })),
  }));
  const status = await m.getSiteStatus(found.id);
  const lines = [
    `Site de « ${found.title} » — ${site.published ? "publié" : "non publié"} (adresse ${status.url ?? "aucune pour l'instant"})`,
    ...status.warnings.map((w) => `ATTENTION : ${w}`),
    `Thème : couleurs ${Object.entries(site.draft.theme.colors).map(([k, v]) => `${k} ${v}`).join(", ")} ; polices ${site.draft.theme.fonts.heading} / ${site.draft.theme.fonts.body}`,
    ...pages.flatMap((p) => [
      `Page « ${p.title} » [${p.slug}] (${p.kind}${p.inMenu ? "" : ", hors menu"}) : ${p.sections.map((s) => `bande ${s.band} (${s.blocks.map((b) => b.kind).join(", ") || "vide"})`).join(" ; ") || "—"}`,
      ...p.sections.flatMap((s) => [
        `  Bande ${s.band} : fond ${JSON.stringify(s.background)}, texte ${s.textColor}`,
        ...s.blocks.map((b) => `    Bloc ${b.block} : ${blockText(b)}`),
      ]),
    ]),
    site.issues.length ? `Lisibilité à corriger : ${site.issues.join(" ")}` : "Lisibilité : rien à corriger.",
    ...(domain ? [`Domaine dédié : ${domain.host} (${domain.status})`] : []),
  ];
  return {
    text: lines.join("\n"),
    structured: {
      id: found.id,
      published: site.published,
      publishedAt: site.publishedAt,
      updatedAt: site.updatedAt,
      address: status.url,
      warnings: status.warnings,
      theme: site.draft.theme,
      pages,
      images: [...assetIdsOf(site.draft)],
      contrastIssues: site.issues,
      domain,
    },
  };
}

const describeInput = z.object({ subject: z.string().trim().max(40).optional().describe("Un `kind` de bloc, ou theme, band, page, background ; tous par défaut") });

async function describeBlocks(input: z.infer<typeof describeInput>): Promise<ActionResult> {
  const all = describeSite();
  const picked = input.subject ? all.filter((d) => d.subject === input.subject) : all;
  if (!picked.length) return refusal(`« ${input.subject} » inconnu : kind de bloc ${all.filter((d) => d.kind === "block").map((d) => d.subject).join(", ")} ; structures ${SITE_SUBJECTS.join(", ")}.`);
  return { text: describeSiteText(picked), structured: { subjects: picked } };
}

async function readAssets(input: z.infer<typeof eventInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "site");
  if (typeof found === "string") return refusal(found);
  const m = await ticketing();
  const site = await m.getSite(found.id);
  const assets = await m.listAssets(site.id);
  const where = (a: (typeof assets)[number]) => [...a.usedIn.draft.map((w) => `brouillon › ${w}`), ...a.usedIn.published.map((w) => `publié › ${w}`)];
  const lines = assets.map(
    (a) => `- ${a.id} « ${a.name || "sans nom"} » ${a.width}×${a.height}, ${Math.round(a.bytes / 1024)} Ko, variantes ${a.variants.map((v) => v.w).join("/") || "aucune"} ; texte alternatif : ${a.alt || "(aucun)"} ; ${where(a).length ? `utilisée : ${where(a).join(" ; ")}` : "inutilisée"}`
  );
  return { text: assets.length ? `Images du site de « ${found.title} » :\n${lines.join("\n")}` : `Aucune image sur le site de « ${found.title} ».`, structured: { images: assets.map((a) => ({ ...a, usedIn: a.usedIn })) } };
}

export const SITE_READS: McpActionDef[] = [
  {
    name: "ticketing_site_assets",
    action: "ticketing_site_assets",
    kind: "read",
    description: "Images du site d'un événement : identifiant (à utiliser dans theme.logoAssetId, headerAssetId, un fond ou un bloc image), nom, dimensions, poids, texte alternatif, variantes et emplacements qui les utilisent (brouillon et version publiée).",
    input: eventInput,
    available: readAvailable,
    run: readAssets as McpActionDef["run"],
  },
  {
    name: "describe_site_blocks",
    action: "describe_site_blocks",
    kind: "read",
    description:
      "Description des éléments du site d'événement, générée depuis les schémas de validation : pour chaque kind de bloc (hero, richText, image, gallery, palette, cards, doDont, icons, faq, button, banner, separator) et pour theme, band, page, background : champs, types, obligatoire ou non, bornes, valeurs permises (icônes, polices, clés de palette, directions de dégradé…). À lire avant de composer un `blockData`.",
    input: describeInput,
    available: readAvailable,
    run: describeBlocks as McpActionDef["run"],
  },
  {
    name: "ticketing_site",
    action: "ticketing_site",
    kind: "read",
    description:
      "Site d'un événement de billetterie (brouillon) : thème, pages (par adresse `slug`), bandes et blocs (par rang à partir de 0, texte riche en Markdown), état de publication, adresse, images utilisées et problèmes de lisibilité. À lire avant toute modification.",
    input: eventInput,
    available: readAvailable,
    run: readSite as McpActionDef["run"],
  },
];

// ─── Modification du document (fonctions pures) ──────────────────────────────

type Direction = "up" | "down";
const direction = z.enum(["up", "down"]);

function moveItem<T>(list: T[], index: number, dir: Direction): string | null {
  const j = dir === "up" ? index - 1 : index + 1;
  if (j < 0 || j >= list.length) return dir === "up" ? "Déjà en première position." : "Déjà en dernière position.";
  [list[index], list[j]] = [list[j], list[index]];
  return null;
}

/** Document complet validé comme à l'écran : schéma (liens, pages), puis lisibilité. */
export function validateDocument(input: unknown): SiteDocument | string {
  const parsed = siteDocumentSchema.safeParse(input);
  if (!parsed.success) return explainIssues(parsed.error.issues, siteDocumentSchema, input);
  const issues = contrastIssues(parsed.data);
  return issues.length ? issues.map((i) => i.message).join(" ") : parsed.data;
}

const themePatch = z
  .object({
    colors: themeSchema.shape.colors.partial().optional(),
    fonts: themeSchema.shape.fonts.partial().optional(),
    background: backgroundSchema.optional(),
    logoAssetId: z.string().nullable().optional().describe("Identifiant d'une image déjà sur le site, ou null pour retirer le logo"),
    headerAssetId: z.string().nullable().optional().describe("Identifiant d'une image déjà sur le site, ou null pour retirer l'en-tête"),
  })
  .strict();

const pageFields = pageSchema.pick({ title: true, slug: true, inMenu: true, kind: true }).partial();
const bandFields = sectionSchema.pick({ background: true, textColor: true }).partial();

const pageShape = {
  op: z.enum(["create", "update", "move", "delete"]),
  slug: z.string().trim().max(40).optional().describe("Adresse de la page visée (update, move, delete), voir ticketing_site"),
  page: pageFields.optional().describe("create : title et slug ; update : champs à changer (title, slug, inMenu, kind)"),
  direction: direction.optional().describe("move : up ou down"),
};
const blockShape = {
  op: z.enum(["create", "update", "move", "delete"]),
  target: z.enum(["band", "block"]),
  page: z.string().trim().max(40).describe("Adresse (slug) de la page"),
  band: z.number().int().min(0).optional().describe("Rang de la bande (tout sauf la création d'une bande)"),
  block: z.number().int().min(0).optional().describe("Rang du bloc (update, move, delete)"),
  position: z.number().int().min(0).optional().describe("create : rang d'insertion, à la fin par défaut"),
  direction: direction.optional(),
  bandFields: bandFields.optional().describe("Bande : background, textColor"),
  blockData: z.record(z.string(), z.unknown()).optional().describe("Bloc complet avec son `kind`"),
  markdown: z.string().max(20000).optional().describe("Texte riche d'un bloc richText, en Markdown restreint"),
};

/** Une opération : mêmes formes que les outils unitaires, réutilisée par l'outil par lot. */
const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("theme"), theme: themePatch }).strict(),
  z.object({ type: z.literal("page"), ...pageShape }).strict(),
  z.object({ type: z.literal("block"), ...blockShape }).strict(),
]);
export type SiteOperation = z.infer<typeof operationSchema>;
type PageOp = Extract<SiteOperation, { type: "page" }>;
type BlockOp = Extract<SiteOperation, { type: "block" }>;

/** Les fonctions `apply*` modifient une copie sans la valider : la validation est unique, en fin de lot. */
function applyTheme(doc: SiteDocument, patch: z.infer<typeof themePatch>): SiteDocument | string {
  const next = structuredClone(doc);
  if (patch.colors) Object.assign(next.theme.colors, patch.colors);
  if (patch.fonts) Object.assign(next.theme.fonts, patch.fonts);
  if (patch.background) next.theme.background = patch.background;
  for (const key of ["logoAssetId", "headerAssetId"] as const) {
    if (patch[key] === null) delete next.theme[key];
    else if (patch[key]) next.theme[key] = patch[key];
  }
  return next;
}

function applyPage(doc: SiteDocument, o: PageOp): SiteDocument | string {
  const next = structuredClone(doc);
  const { slug, page, direction: dir } = o;
  if (o.op === "create") {
    if (!page?.title || !page.slug) return "Pour créer une page, indiquez `page.title` et `page.slug`.";
    const created = pageSchema.safeParse({ kind: "content", ...page });
    if (!created.success) return explainIssues(created.error.issues, pageSchema, page);
    next.pages.push(created.data);
    return next;
  }
  const index = next.pages.findIndex((p) => p.slug === slug);
  if (index < 0) return `Page « ${slug ?? ""} » introuvable : pages existantes ${next.pages.map((p) => p.slug).join(", ")}.`;
  if (o.op === "delete") {
    if (next.pages.length === 1) return "Un site garde au moins une page.";
    next.pages.splice(index, 1);
  } else if (o.op === "move") {
    if (!dir) return "Indiquez `direction` (up ou down).";
    const error = moveItem(next.pages, index, dir);
    if (error) return error;
  } else {
    if (!page || Object.keys(page).length === 0) return "Indiquez les champs de `page` à modifier.";
    Object.assign(next.pages[index], page);
  }
  return next;
}

function applyBlock(doc: SiteDocument, edit: BlockOp): SiteDocument | string {
  const next = structuredClone(doc);
  const page = next.pages.find((p) => p.slug === edit.page);
  if (!page) return `Page « ${edit.page} » introuvable : pages existantes ${next.pages.map((p) => p.slug).join(", ")}.`;
  if (page.kind !== "content") return "Cette page est automatique : seules les pages composées ont des bandes et des blocs.";

  if (edit.target === "band") {
    if (edit.op === "create") {
      const band = sectionSchema.safeParse({ blocks: [], ...edit.bandFields });
      if (!band.success) return explainIssues(band.error.issues, sectionSchema, edit.bandFields ?? {});
      page.sections.splice(Math.min(edit.position ?? page.sections.length, page.sections.length), 0, band.data);
      return next;
    }
    const band = edit.band === undefined ? undefined : page.sections[edit.band];
    if (!band) return `Bande ${edit.band ?? "?"} introuvable : la page en compte ${page.sections.length} (rangs 0 à ${page.sections.length - 1}).`;
    if (edit.op === "delete") page.sections.splice(edit.band!, 1);
    else if (edit.op === "move") {
      if (!edit.direction) return "Indiquez `direction` (up ou down).";
      const error = moveItem(page.sections, edit.band!, edit.direction);
      if (error) return error;
    } else {
      if (!edit.bandFields || Object.keys(edit.bandFields).length === 0) return "Indiquez les champs de `bandFields` à modifier.";
      Object.assign(band, edit.bandFields);
    }
    return next;
  }

  const band = edit.band === undefined ? undefined : page.sections[edit.band];
  if (!band) return `Bande ${edit.band ?? "?"} introuvable : la page en compte ${page.sections.length} (rangs 0 à ${page.sections.length - 1}).`;
  if (edit.op === "create" || edit.op === "update") {
    let data: Record<string, unknown> | undefined = edit.blockData;
    if (edit.markdown !== undefined) {
      try {
        data = { ...(data ?? {}), kind: "richText", content: parseRichText(edit.markdown) };
      } catch (error) {
        if (error instanceof RichTextError) return `Texte refusé : ${error.message}`;
        throw error;
      }
    }
    if (!data) return "Indiquez `blockData` (ou `markdown` pour un bloc de texte).";
    const parsed = blockSchema.safeParse(data);
    if (!parsed.success) return explainIssues(parsed.error.issues, blockSchema, data, "bloc");
    if (edit.op === "create") band.blocks.splice(Math.min(edit.position ?? band.blocks.length, band.blocks.length), 0, parsed.data);
    else {
      if (edit.block === undefined || !band.blocks[edit.block]) return `Bloc ${edit.block ?? "?"} introuvable dans cette bande (rangs 0 à ${band.blocks.length - 1}).`;
      band.blocks[edit.block] = parsed.data;
    }
    return next;
  }
  if (edit.block === undefined || !band.blocks[edit.block]) return `Bloc ${edit.block ?? "?"} introuvable dans cette bande (rangs 0 à ${band.blocks.length - 1}).`;
  if (edit.op === "delete") band.blocks.splice(edit.block, 1);
  else {
    if (!edit.direction) return "Indiquez `direction` (up ou down).";
    const error = moveItem(band.blocks, edit.block, edit.direction);
    if (error) return error;
  }
  return next;
}

function applyOne(doc: SiteDocument, op: SiteOperation): SiteDocument | string {
  try {
    return op.type === "theme" ? applyTheme(doc, op.theme) : op.type === "page" ? applyPage(doc, op) : applyBlock(doc, op);
  } catch (error) {
    if (error instanceof z.ZodError) return error.issues.map((i) => `${i.path.join(".") || "saisie"} : ${i.message}`).join(" ; ");
    throw error;
  }
}

/** Opérations appliquées dans l'ordre sur une copie, puis une seule validation (schéma et lisibilité) : tout ou rien. */
export function applyOperations(doc: SiteDocument, ops: SiteOperation[]): SiteDocument | string {
  let current = doc;
  for (const [i, op] of ops.entries()) {
    const next = applyOne(current, op);
    if (typeof next === "string") return ops.length > 1 ? `Opération ${i + 1} : ${next}` : next;
    current = next;
  }
  return validateDocument(current);
}

/**
 * Portion du brouillon qu'une opération touche : seule elle est comparée entre l'aperçu et la
 * confirmation, si bien que deux aperçus sur des endroits différents restent valides l'un après l'autre.
 */
function portionOf(doc: SiteDocument, op: SiteOperation): unknown {
  if (op.type === "theme") return { theme: doc.theme };
  const slugs = doc.pages.map((p) => p.slug);
  if (op.type === "page") {
    const page = doc.pages.find((p) => p.slug === op.slug);
    return { slugs, page: op.op === "create" || !page ? null : op.op === "delete" ? page : { ...page, sections: undefined } };
  }
  const page = doc.pages.find((p) => p.slug === op.page);
  if (!page) return { slugs, page: null };
  const base = { slug: op.page, kind: page.kind };
  if (op.target === "band" && op.op === "create") return { ...base, bands: page.sections.length };
  if (op.band === undefined) return { ...base, band: null };
  const neighbour = op.target === "band" && op.op === "move" ? page.sections[op.direction === "up" ? op.band - 1 : op.band + 1] : undefined;
  return { ...base, band: page.sections[op.band] ?? null, neighbour };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface OpsPayload {
  eventId: string;
  ops: SiteOperation[];
  [key: string]: unknown;
}

/** Empreinte : la portion du brouillon que les opérations touchent n'a pas bougé depuis l'aperçu. */
const opsState = async (p: { eventId?: string; ops?: SiteOperation[] }) => {
  const { draft } = await (await ticketing()).getSite(p.eventId!);
  return (p.ops ?? []).map((op) => portionOf(draft, op));
};

const describeOp = (op: SiteOperation): string => {
  if (op.type === "theme") return `Thème : ${JSON.stringify(op.theme)}`;
  if (op.type === "page") return `Page : ${op.op}${op.slug ? ` « ${op.slug} »` : ""}${op.page ? ` ${JSON.stringify(op.page)}` : ""}${op.direction ? ` (${op.direction})` : ""}`;
  return `${op.target === "band" ? "Bande" : "Bloc"} : ${op.op} sur la page « ${op.page} »${op.band !== undefined ? `, bande ${op.band}` : ""}${op.block !== undefined ? `, bloc ${op.block}` : ""}`;
};

async function prepareOps(event: { id: string; title: string }, ops: SiteOperation[]): Promise<Prepared<OpsPayload> | string> {
  const site = await (await ticketing()).getSite(event.id);
  const next = applyOperations(site.draft, ops);
  if (typeof next === "string") return next;
  const lines = ops.length === 1 ? [describeOp(ops[0])] : ops.map((op, i) => `${i + 1}. ${describeOp(op)}`);
  return { lines: [`Site de « ${event.title} » (brouillon, non publié tant que vous ne le publiez pas)`, ...lines], payload: { eventId: event.id, ops: jsonify(ops) } };
}

/** Les opérations sont réappliquées sur le brouillon courant : un document devenu invalide ou illisible est refusé. */
async function saveOps(p: OpsPayload, ctx: ActionContext) {
  const m = await ticketing();
  const next = applyOperations((await m.getSite(p.eventId)).draft, p.ops);
  if (typeof next === "string") throw new ApiError(422, next);
  await m.saveDraft(p.eventId, ctx.session.user.id, next);
  return { text: "Brouillon du site enregistré (pas encore publié).", vue: "site" };
}

const themeAction = eventAction({
  action: "edit_ticketing_site_theme",
  role: "site",
  description: previewDesc("modifier le thème du site d'un événement (couleurs #RRGGBB, polices, fond, logo, en-tête parmi les images du site) ; refuse un texte peu lisible dès l'aperçu"),
  confirmDescription: confirmDesc("enregistrer le thème du brouillon du site"),
  input: z.object({ event: eventRef, theme: themePatch }),
  prepare: (input, _ctx, event) => prepareOps(event!, [{ type: "theme", theme: input.theme }]),
  state: opsState,
  execute: saveOps,
});

const pageAction = eventAction({
  action: "edit_ticketing_site_page",
  role: "site",
  description: previewDesc("créer, modifier, déplacer ou supprimer une page du site (8 au plus ; types content, tickets, menus, practical) ; la première page est l'accueil"),
  confirmDescription: confirmDesc("enregistrer les pages du brouillon du site"),
  input: z.object({ event: eventRef, ...pageShape }),
  prepare: (input, _ctx, event) => {
    const { event: _e, ...rest } = input;
    return prepareOps(event!, [{ type: "page", ...rest }]);
  },
  state: opsState,
  execute: saveOps,
});

const blockAction = eventAction({
  action: "edit_ticketing_site_block",
  role: "site",
  description: previewDesc(
    "créer, modifier, déplacer ou supprimer une bande (target band : fond, couleur du texte) ou un bloc (target block) d'une page composée. blockData : un bloc complet (kind hero, richText, image, gallery, palette, cards, doDont, icons, faq, button, banner, separator) ; pour un texte, `markdown` (Markdown restreint : ## titre, ### sous-titre, listes, **gras**, *italique*, liens https/mailto/page:adresse, aucun HTML). Rangs à partir de 0, voir ticketing_site. Champs et valeurs permises de chaque bloc : describe_site_blocks ; images du site : ticketing_site_assets, upload_ticketing_site_asset"
  ),
  confirmDescription: confirmDesc("enregistrer les bandes et blocs du brouillon du site"),
  input: z.object({ event: eventRef, ...blockShape }),
  prepare: (input, _ctx, event) => {
    const { event: _e, ...rest } = input;
    return prepareOps(event!, [{ type: "block", ...rest }]);
  },
  state: opsState,
  execute: saveOps,
});

const batchAction = eventAction({
  action: "edit_ticketing_site_batch",
  role: "site",
  description: previewDesc(
    "appliquer d'un coup 1 à 50 opérations au brouillon du site, dans l'ordre, en tout ou rien (validation finale unique : schéma et lisibilité). Chaque opération a un `type` : theme (clé theme), page (op, slug, page, direction) ou block (op, target, page, band, block, position, direction, bandFields, blockData, markdown), avec les mêmes champs que les outils unitaires (describe_site_blocks décrit les blocs)"
  ),
  confirmDescription: confirmDesc("enregistrer d'un coup les opérations du lot sur le brouillon du site"),
  input: z.object({ event: eventRef, operations: z.array(operationSchema).min(1).max(50).describe("Opérations appliquées dans l'ordre") }),
  prepare: (input, _ctx, event) => prepareOps(event!, input.operations),
  state: opsState,
  execute: saveOps,
});

const IMAGE_HINT = "JPEG, PNG, WebP ou SVG (rastérisé), 8 Mo au plus, 16 à 8000 px";

const uploadAction = eventAction({
  action: "upload_ticketing_site_asset",
  role: "site",
  description: previewDesc(
    `ajouter une image au site d'un événement, depuis une adresse https publique (source.url) ou en base64 (source.base64, data-URL acceptée, filename facultatif) ; ${IMAGE_HINT}. Le texte alternatif (alt, 1 à 200 caractères) est obligatoire. L'aperçu télécharge, vérifie et traite l'image (variantes WebP 640, 1280 et 2400 px, sans métadonnées) ; elle n'est ajoutée qu'à la confirmation, qui renvoie l'identifiant à utiliser`
  ),
  confirmDescription: confirmDesc("ajouter l'image au site (identifiant renvoyé)"),
  input: z.object({
    event: eventRef,
    source: z.union([
      z.object({ url: z.string().trim().min(1).max(2000).describe("Adresse https publique de l'image (aucune redirection suivie)") }).strict(),
      z.object({ base64: z.string().min(1).max(11_500_000).describe("Contenu de l'image en base64 ou data-URL"), filename: z.string().trim().max(120).optional() }).strict(),
    ]),
    alt: z.string().trim().min(1).max(200).describe("Texte alternatif de l'image (accessibilité), obligatoire"),
    name: z.string().trim().max(120).optional().describe("Nom lisible de l'image"),
  }),
  prepare: async (input, _ctx, event): Promise<Prepared<{ eventId: string; siteId: string; assetId: string }> | string> => {
    const m = await ticketing();
    const site = await m.getSite(event!.id);
    const source = input.source;
    const buffer = "url" in source ? await safeFetchImage(source.url) : m.decodeBase64Image(source.base64);
    const fallbackName = "url" in source ? (() => {
      try {
        return decodeURIComponent(new URL(source.url).pathname.split("/").pop() ?? "");
      } catch {
        return "";
      }
    })() : (source.filename ?? "");
    const staged = await m.stageAsset(site.id, buffer, { alt: input.alt, name: input.name || fallbackName });
    return {
      lines: [
        `Ajouter l'image « ${staged.name || "sans nom"} » au site de « ${event!.title} » (${staged.source} → WebP ${staged.width}×${staged.height}, ${Math.round(staged.bytes / 1024)} Ko)`,
        `Variantes : ${staged.variants.map((v) => `${v.w} px`).join(", ")}`,
        `Texte alternatif : ${staged.alt}`,
        "L'image n'est ajoutée qu'à la confirmation (en attente 1 heure au plus).",
      ],
      payload: { eventId: event!.id, siteId: site.id, assetId: staged.id },
    };
  },
  state: async (p) => (await ticketing()).assetState(p.siteId, p.assetId),
  execute: async (p, ctx) => {
    const done = await (await ticketing()).confirmAsset(p.siteId, p.assetId, ctx.session.user.id);
    return { text: `Image ajoutée au site (identifiant ${done.id}, ${done.width}×${done.height}). Utilisez cet identifiant comme assetId (logo, en-tête, fond, bloc image).`, vue: "site", data: done };
  },
});

const deleteAssetAction = eventAction({
  action: "delete_ticketing_site_asset",
  role: "site",
  description: previewDesc("supprimer une image du site ; refusée si elle est utilisée dans le brouillon ou la version publiée (l'aperçu indique où)"),
  confirmDescription: confirmDesc("supprimer l'image du site"),
  input: z.object({ event: eventRef, assetId: z.string().trim().min(1).max(40).describe("Identifiant de l'image, voir ticketing_site_assets") }),
  prepare: async (input, _ctx, event): Promise<Prepared<{ eventId: string; siteId: string; assetId: string }> | string> => {
    const m = await ticketing();
    const site = await m.getSite(event!.id);
    const asset = (await m.listAssets(site.id)).find((a) => a.id === input.assetId);
    if (!asset) return "Image introuvable sur ce site : voir ticketing_site_assets.";
    const used = [...asset.usedIn.draft.map((w) => `brouillon › ${w}`), ...asset.usedIn.published.map((w) => `version publiée › ${w}`)];
    if (used.length) return `Image utilisée, suppression refusée : ${used.join(" ; ")}. Retirez-la d'abord (et republiez si elle est dans la version publiée).`;
    return { lines: [`Supprimer l'image « ${asset.name || asset.id} » (${asset.width}×${asset.height}) du site de « ${event!.title} » : définitif`], payload: { eventId: event!.id, siteId: site.id, assetId: asset.id } };
  },
  state: async (p) => {
    const asset = (await (await ticketing()).listAssets(p.siteId)).find((a) => a.id === p.assetId);
    return asset && { id: asset.id, usedIn: asset.usedIn };
  },
  execute: async (p, ctx) => {
    await (await ticketing()).deleteAsset(p.siteId, p.assetId, ctx.session.user.id);
    return { text: "Image supprimée.", vue: "site" };
  },
});

const publishState = async (p: { eventId?: string }) => {
  const site = await (await ticketing()).getSite(p.eventId!);
  return { updatedAt: site.updatedAt, published: site.published, publishedAt: site.publishedAt };
};

const publishAction = eventAction({
  action: "publish_ticketing_site",
  role: "site",
  description: previewDesc("publier le brouillon du site (visible du public, si l'Admin de l'église a activé les sites) ou le dépublier"),
  confirmDescription: confirmDesc("publier ou dépublier le site de l'événement"),
  input: z.object({ event: eventRef, op: z.enum(["publish", "unpublish"]) }),
  prepare: async (input, _ctx, event): Promise<Prepared<{ eventId: string; op: "publish" | "unpublish" }> | string> => {
    const site = await (await ticketing()).getSite(event!.id);
    if (input.op === "unpublish") {
      if (!site.published) return "Le site n'est pas publié.";
      return { lines: [`Dépublier le site de « ${event!.title} » : il n'est plus visible du public`], payload: { eventId: event!.id, op: "unpublish" } };
    }
    const checked = validateDocument(site.draft);
    if (typeof checked === "string") return checked;
    const { url, warnings } = await (await ticketing()).getSiteStatus(event!.id);
    return {
      lines: [
        ...warnings.map((w) => `ATTENTION : ${w}`),
        `${site.published ? "Republier" : "Publier"} le brouillon du site de « ${event!.title} » : ${warnings.length ? "la version publiée sera servie dès que ces conditions seront remplies" : "il devient visible du public"}`,
        `Adresse publique : ${url ?? "aucune pour l'instant"}`,
      ],
      payload: { eventId: event!.id, op: "publish" },
      structured: { warnings, address: url },
    };
  },
  state: publishState,
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "publish") {
      await m.publishSite(p.eventId, ctx.session.user.id);
      const { url, warnings } = await m.getSiteStatus(p.eventId);
      return { text: `Site publié. Adresse publique : ${url ?? "aucune pour l'instant"}.${warnings.map((w) => `\nATTENTION : ${w}`).join("")}`, vue: "site", structured: { warnings, address: url } };
    }
    await m.unpublishSite(p.eventId, ctx.session.user.id);
    return { text: "Site dépublié.", vue: "site" };
  },
});

const domainAction = eventAction({
  action: "request_ticketing_site_domain",
  role: "configure",
  description: previewDesc(
    "demander, vérifier (DNS) ou supprimer le domaine dédié du site ; réservé à l'organisateur. La demande renvoie l'enregistrement TXT et le CNAME à créer ; l'approbation reste celle de l'administration de la plateforme"
  ),
  confirmDescription: confirmDesc("agir sur le domaine dédié du site"),
  input: z.object({ event: eventRef, op: z.enum(["request", "verify", "remove"]), host: z.string().trim().max(253).optional().describe("request : le domaine, par exemple fete.exemple.org") }),
  prepare: async (input, _ctx, event): Promise<Prepared<{ eventId: string; op: "request" | "verify" | "remove"; host?: string }> | string> => {
    const m = await ticketing();
    const current = await m.getDomain(event!.id);
    if (input.op === "request") {
      if (!input.host) return "Indiquez `host`.";
      if (current) return `Ce site a déjà le domaine ${current.host} : supprimez-le avant d'en demander un autre.`;
      return { lines: [`Demander le domaine dédié ${input.host} pour « ${event!.title} » (DNS à configurer, puis approbation de la plateforme)`], payload: { eventId: event!.id, op: "request", host: input.host } };
    }
    if (!current) return "Aucun domaine dédié sur ce site.";
    return { lines: [`${input.op === "verify" ? "Vérifier le DNS de" : "Supprimer"} ${current.host} (état : ${current.status})`], payload: { eventId: event!.id, op: input.op } };
  },
  state: async (p) => {
    const d = await (await ticketing()).getDomain(p.eventId!);
    return d && { id: d.id, host: d.host, status: d.status };
  },
  execute: async (p, ctx) => {
    const m = await ticketing();
    const userId = ctx.session.user.id;
    if (p.op === "request") {
      await m.getSite(p.eventId);
      const d = await m.requestDomain(p.eventId, userId, p.host!);
      return { text: `Domaine demandé. Créez ces enregistrements : ${d.records.map((r) => `${r.type} ${r.name} → ${r.value}`).join(" ; ")}. Puis vérifiez le DNS.`, vue: "site" };
    }
    if (p.op === "verify") {
      const d = await m.verifyDomain(p.eventId, userId);
      return { text: d.lastError ? `Vérification : ${d.lastError}` : `Domaine ${d.host} : ${d.status === "VERIFIED" ? "DNS vérifié, en attente d'approbation" : d.status}.`, vue: "site" };
    }
    await m.removeDomain(p.eventId, userId);
    return { text: "Domaine supprimé.", vue: "site" };
  },
});

/**
 * Les outils du site ne sont proposés que si le drapeau d'instance des sites est actif (coupé par
 * défaut, actif en recette) : prédicat `ticketingSites`, calculé côté serveur
 * (`assistant/_viewer.ts`). La diffusion publique dépend en plus de l'activation par l'église.
 */
const whenSitesEnabled = (def: McpActionDef): McpActionDef => ({ ...def, available: (viewer) => def.available(viewer) && viewer.predicates.includes("ticketingSites") });

export const SITE_ACTIONS: McpActionDef[] = [...SITE_READS, ...themeAction, ...pageAction, ...blockAction, ...batchAction, ...uploadAction, ...deleteAssetAction, ...publishAction, ...domainAction].map(whenSitesEnabled);
