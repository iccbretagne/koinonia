import { z } from "zod";
import {
  RichTextError,
  assetIdsOf,
  backgroundSchema,
  blockSchema,
  contrastIssues,
  pageSchema,
  parseRichText,
  richTextToMarkdown,
  sectionSchema,
  siteDocumentSchema,
  themeSchema,
  type SiteDocument,
} from "@/modules/ticketing/schemas";
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

function siteUrl(slug: string, dedicated: string | null): string {
  if (dedicated) return `https://${dedicated}`;
  const base = process.env.SITE_BASE_DOMAIN;
  return base ? `https://${slug}.${base}` : "(adresse des sites non configurée)";
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
  const lines = [
    `Site de « ${found.title} » — ${site.published ? "publié" : "non publié"} (adresse ${siteUrl(site.slug, null)})`,
    `Thème : couleurs ${Object.entries(site.draft.theme.colors).map(([k, v]) => `${k} ${v}`).join(", ")} ; polices ${site.draft.theme.fonts.heading} / ${site.draft.theme.fonts.body}`,
    ...pages.map((p) => `Page « ${p.title} » [${p.slug}] (${p.kind}${p.inMenu ? "" : ", hors menu"}) : ${p.sections.map((s) => `bande ${s.band} (${s.blocks.map((b) => b.kind).join(", ") || "vide"})`).join(" ; ") || "—"}`),
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
      address: siteUrl(site.slug, domain?.status === "APPROVED" ? domain.host : null),
      theme: site.draft.theme,
      pages,
      images: [...assetIdsOf(site.draft)],
      contrastIssues: site.issues,
      domain,
    },
  };
}

export const SITE_READS: McpActionDef[] = [
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
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".") || "document"} : ${i.message}`).join(" ; ");
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

export function applyTheme(doc: SiteDocument, patch: z.infer<typeof themePatch>): SiteDocument | string {
  const next = structuredClone(doc);
  if (patch.colors) Object.assign(next.theme.colors, patch.colors);
  if (patch.fonts) Object.assign(next.theme.fonts, patch.fonts);
  if (patch.background) next.theme.background = patch.background;
  for (const key of ["logoAssetId", "headerAssetId"] as const) {
    if (patch[key] === null) delete next.theme[key];
    else if (patch[key]) next.theme[key] = patch[key];
  }
  return validateDocument(next);
}

const pageFields = pageSchema.pick({ title: true, slug: true, inMenu: true, kind: true }).partial();

export function applyPage(doc: SiteDocument, op: "create" | "update" | "move" | "delete", slug: string | undefined, page: z.infer<typeof pageFields> | undefined, dir?: Direction): SiteDocument | string {
  const next = structuredClone(doc);
  if (op === "create") {
    if (!page?.title || !page.slug) return "Pour créer une page, indiquez `page.title` et `page.slug`.";
    next.pages.push(pageSchema.parse({ kind: "content", ...page }));
    return validateDocument(next);
  }
  const index = next.pages.findIndex((p) => p.slug === slug);
  if (index < 0) return `Page « ${slug ?? ""} » introuvable : pages existantes ${next.pages.map((p) => p.slug).join(", ")}.`;
  if (op === "delete") {
    if (next.pages.length === 1) return "Un site garde au moins une page.";
    next.pages.splice(index, 1);
  } else if (op === "move") {
    if (!dir) return "Indiquez `direction` (up ou down).";
    const error = moveItem(next.pages, index, dir);
    if (error) return error;
  } else {
    if (!page || Object.keys(page).length === 0) return "Indiquez les champs de `page` à modifier.";
    Object.assign(next.pages[index], page);
  }
  return validateDocument(next);
}

const bandFields = sectionSchema.pick({ background: true, textColor: true }).partial();

export interface BlockEdit {
  op: "create" | "update" | "move" | "delete";
  target: "band" | "block";
  page: string;
  band?: number;
  block?: number;
  position?: number;
  direction?: Direction;
  bandFields?: z.infer<typeof bandFields>;
  blockData?: Record<string, unknown>;
  markdown?: string;
}

export function applyBlock(doc: SiteDocument, edit: BlockEdit): SiteDocument | string {
  const next = structuredClone(doc);
  const page = next.pages.find((p) => p.slug === edit.page);
  if (!page) return `Page « ${edit.page} » introuvable : pages existantes ${next.pages.map((p) => p.slug).join(", ")}.`;
  if (page.kind !== "content") return "Cette page est automatique : seules les pages composées ont des bandes et des blocs.";

  if (edit.target === "band") {
    if (edit.op === "create") {
      const band = sectionSchema.parse({ blocks: [], ...edit.bandFields });
      page.sections.splice(Math.min(edit.position ?? page.sections.length, page.sections.length), 0, band);
      return validateDocument(next);
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
    return validateDocument(next);
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
    if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".") || "bloc"} : ${i.message}`).join(" ; ");
    if (edit.op === "create") band.blocks.splice(Math.min(edit.position ?? band.blocks.length, band.blocks.length), 0, parsed.data);
    else {
      if (edit.block === undefined || !band.blocks[edit.block]) return `Bloc ${edit.block ?? "?"} introuvable dans cette bande (rangs 0 à ${band.blocks.length - 1}).`;
      band.blocks[edit.block] = parsed.data;
    }
    return validateDocument(next);
  }
  if (edit.block === undefined || !band.blocks[edit.block]) return `Bloc ${edit.block ?? "?"} introuvable dans cette bande (rangs 0 à ${band.blocks.length - 1}).`;
  if (edit.op === "delete") band.blocks.splice(edit.block, 1);
  else {
    if (!edit.direction) return "Indiquez `direction` (up ou down).";
    const error = moveItem(band.blocks, edit.block, edit.direction);
    if (error) return error;
  }
  return validateDocument(next);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface DocPayload {
  eventId: string;
  doc: SiteDocument;
  [key: string]: unknown;
}

/** Empreinte : le brouillon n'a pas bougé depuis l'aperçu. */
const draftState = async (p: { eventId?: string }) => (await (await ticketing()).getSite(p.eventId!)).updatedAt;

async function prepareEdit(eventId: string, title: string, compute: (doc: SiteDocument) => SiteDocument | string, summary: string[]): Promise<Prepared<DocPayload> | string> {
  const site = await (await ticketing()).getSite(eventId);
  const next = compute(site.draft);
  if (typeof next === "string") return next;
  return { lines: [`Site de « ${title} » (brouillon, non publié tant que vous ne le publiez pas)`, ...summary], payload: { eventId, doc: jsonify(next) } };
}

async function saveEdit(p: DocPayload, ctx: ActionContext) {
  await (await ticketing()).saveDraft(p.eventId, ctx.session.user.id, p.doc);
  return { text: "Brouillon du site enregistré (pas encore publié).", vue: "site" };
}

const themeAction = eventAction({
  action: "edit_ticketing_site_theme",
  role: "site",
  description: previewDesc("modifier le thème du site d'un événement (couleurs #RRGGBB, polices, fond, logo, en-tête parmi les images du site) ; refuse un texte peu lisible dès l'aperçu"),
  confirmDescription: confirmDesc("enregistrer le thème du brouillon du site"),
  input: z.object({ event: eventRef, theme: themePatch }),
  prepare: (input, _ctx, event) => prepareEdit(event!.id, event!.title, (doc) => applyTheme(doc, input.theme), [`Thème : ${JSON.stringify(input.theme)}`]),
  state: draftState,
  execute: saveEdit,
});

const pageAction = eventAction({
  action: "edit_ticketing_site_page",
  role: "site",
  description: previewDesc("créer, modifier, déplacer ou supprimer une page du site (8 au plus ; types content, tickets, menus, practical) ; la première page est l'accueil"),
  confirmDescription: confirmDesc("enregistrer les pages du brouillon du site"),
  input: z.object({
    event: eventRef,
    op: z.enum(["create", "update", "move", "delete"]),
    slug: z.string().trim().max(40).optional().describe("Adresse de la page visée (update, move, delete), voir ticketing_site"),
    page: pageFields.optional().describe("create : title et slug ; update : champs à changer (title, slug, inMenu, kind)"),
    direction: direction.optional().describe("move : up ou down"),
  }),
  prepare: (input, _ctx, event) =>
    prepareEdit(event!.id, event!.title, (doc) => applyPage(doc, input.op, input.slug, input.page, input.direction), [`Page : ${input.op}${input.slug ? ` « ${input.slug} »` : ""}${input.page ? ` ${JSON.stringify(input.page)}` : ""}${input.direction ? ` (${input.direction})` : ""}`]),
  state: draftState,
  execute: saveEdit,
});

const blockAction = eventAction({
  action: "edit_ticketing_site_block",
  role: "site",
  description: previewDesc(
    "créer, modifier, déplacer ou supprimer une bande (target band : fond, couleur du texte) ou un bloc (target block) d'une page composée. blockData : un bloc complet (kind hero, richText, image, gallery, palette, cards, doDont, icons, faq, button, banner, separator) ; pour un texte, `markdown` (Markdown restreint : ## titre, ### sous-titre, listes, **gras**, *italique*, liens https/mailto/page:adresse, aucun HTML). Rangs à partir de 0, voir ticketing_site"
  ),
  confirmDescription: confirmDesc("enregistrer les bandes et blocs du brouillon du site"),
  input: z.object({
    event: eventRef,
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
  }),
  prepare: (input, _ctx, event) =>
    prepareEdit(
      event!.id,
      event!.title,
      (doc) => applyBlock(doc, { ...input, bandFields: input.bandFields, blockData: input.blockData }),
      [`${input.target === "band" ? "Bande" : "Bloc"} : ${input.op} sur la page « ${input.page} »${input.band !== undefined ? `, bande ${input.band}` : ""}${input.block !== undefined ? `, bloc ${input.block}` : ""}`]
    ),
  state: draftState,
  execute: saveEdit,
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
    return { lines: [`${site.published ? "Republier" : "Publier"} le brouillon du site de « ${event!.title} » : il devient visible du public`], payload: { eventId: event!.id, op: "publish" } };
  },
  state: publishState,
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "publish") {
      await m.publishSite(p.eventId, ctx.session.user.id);
      return { text: "Site publié.", vue: "site" };
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

export const SITE_ACTIONS: McpActionDef[] = [...SITE_READS, ...themeAction, ...pageAction, ...blockAction, ...publishAction, ...domainAction];
