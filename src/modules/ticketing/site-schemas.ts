import { z } from "zod";

/**
 * Document d'un site d'événement (spec 084) : thème, pages, sections et blocs typés. Schémas purs,
 * partagés par les services, les contrats d'API et l'éditeur. Aucune valeur de style libre : les
 * couleurs des fonds et du texte sont des **clés de la palette du thème**, les directions, polices,
 * séparateurs et pictogrammes des listes fermées ; le texte riche est un arbre (`rich-text.ts`).
 */

export const PALETTE_KEYS = ["primary", "secondary", "accent", "background", "text"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export const PALETTE_LABEL: Record<PaletteKey, string> = {
  primary: "Principale",
  secondary: "Secondaire",
  accent: "Accent",
  background: "Fond",
  text: "Texte",
};

export const SITE_FONTS = ["montserrat", "playfair", "cormorant", "lora", "inter", "sourceSans"] as const;
export type SiteFont = (typeof SITE_FONTS)[number];
export const SITE_FONT_LABEL: Record<SiteFont, string> = {
  montserrat: "Montserrat",
  playfair: "Playfair Display",
  cormorant: "Cormorant Garamond",
  lora: "Lora",
  inter: "Inter",
  sourceSans: "Source Sans 3",
};

export const GRADIENT_DIRECTIONS = ["vertical", "horizontal", "diagonal", "radial"] as const;
export const SEPARATOR_STYLES = ["line", "goldDiamond", "wave"] as const;

/** Pictogrammes proposés (bibliothèque fermée, noms lucide). */
export const SITE_ICONS = [
  "shirt", "gem", "users", "camera", "check", "x", "star", "heart", "music", "utensils",
  "coffee", "cake", "gift", "calendar", "clock", "map-pin", "car", "bus", "parking-circle", "accessibility",
  "baby", "ticket", "phone", "mail", "info", "sparkles", "sun", "moon", "flame", "crown",
] as const;

export const SITE_LIMITS = { pages: 8, sections: 12, blocks: 20, gallery: 24, cards: 6, swatches: 8, listItems: 12, faq: 20 } as const;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB")
  .transform((v) => v.toLowerCase());
const assetId = z.string().regex(/^[a-z0-9]{20,40}$/, "Image inconnue");
const line = (max: number) => z.string().trim().min(1).max(max);
const optionalLine = (max: number) => z.string().trim().max(max).optional();
const palette = z.enum(PALETTE_KEYS);
export const pageSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Adresse de page : lettres minuscules, chiffres et tirets")
  .max(40);

// ─── Fonds ───────────────────────────────────────────────────────────────────

export const backgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("color"), color: palette }).strict(),
  z
    .object({
      kind: z.literal("gradient"),
      stops: z.array(palette).min(2).max(3),
      direction: z.enum(GRADIENT_DIRECTIONS),
    })
    .strict(),
  z
    .object({
      kind: z.literal("image"),
      assetId,
      veil: palette,
      opacity: z.number().min(0.2).max(0.9),
      fixed: z.boolean().default(false),
    })
    .strict(),
]);
export type SiteBackground = z.infer<typeof backgroundSchema>;
const NONE: SiteBackground = { kind: "none" };

// ─── Texte riche (arbre) ─────────────────────────────────────────────────────

/** Lien autorisé : https, mailto ou une page du site (`page:slug`). */
export const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v) || /^mailto:[^\s@]+@[^\s@]+$/.test(v) || /^page:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Lien refusé : https, mailto ou page du site seulement");

export const inlineSchema = z
  .object({
    text: z.string().max(2000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: linkSchema.optional(),
  })
  .strict();
export type RichInline = z.infer<typeof inlineSchema>;

const inlines = z.array(inlineSchema).max(200);
export const richNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["p", "h2", "h3"]), children: inlines }).strict(),
  z.object({ type: z.enum(["ul", "ol"]), items: z.array(inlines).min(1).max(30) }).strict(),
]);
export type RichNode = z.infer<typeof richNodeSchema>;
export const richTextSchema = z.array(richNodeSchema).max(60);

// ─── Blocs ───────────────────────────────────────────────────────────────────

const imageRef = z.object({ assetId, alt: line(200), caption: optionalLine(200) }).strict();
const items = z.array(line(200)).max(SITE_LIMITS.listItems);

export const blockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("hero"),
      title: line(120),
      tagline: optionalLine(240),
      showDateLocation: z.boolean().default(true),
      showCountdown: z.boolean().default(false),
      buttonLabel: optionalLine(40),
    })
    .strict(),
  z.object({ kind: z.literal("richText"), content: richTextSchema }).strict(),
  z.object({ kind: z.literal("image"), image: imageRef }).strict(),
  z.object({ kind: z.literal("gallery"), title: optionalLine(120), images: z.array(imageRef).min(1).max(SITE_LIMITS.gallery) }).strict(),
  z
    .object({
      kind: z.literal("palette"),
      title: optionalLine(120),
      // Seule couleur libre : affichée en pastille, jamais appliquée au texte ni à un fond.
      swatches: z.array(z.object({ label: line(60), color: hex }).strict()).min(1).max(SITE_LIMITS.swatches),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cards"),
      cards: z.array(z.object({ title: line(120), icon: z.enum(SITE_ICONS).optional(), image: imageRef.optional(), items }).strict()).min(1).max(SITE_LIMITS.cards),
    })
    .strict(),
  z.object({ kind: z.literal("doDont"), doTitle: line(80), doItems: items, dontTitle: line(80), dontItems: items }).strict(),
  z
    .object({
      kind: z.literal("icons"),
      title: optionalLine(120),
      items: z.array(z.object({ icon: z.enum(SITE_ICONS), label: line(120) }).strict()).min(1).max(SITE_LIMITS.listItems),
    })
    .strict(),
  z
    .object({
      kind: z.literal("faq"),
      items: z.array(z.object({ question: line(200), answer: z.string().trim().min(1).max(2000) }).strict()).min(1).max(SITE_LIMITS.faq),
    })
    .strict(),
  z
    .object({
      kind: z.literal("button"),
      label: line(40),
      target: z.union([z.object({ page: pageSlug }).strict(), z.object({ booking: z.literal(true) }).strict()]),
    })
    .strict(),
  z.object({ kind: z.literal("banner"), background: backgroundSchema, title: line(120), tagline: optionalLine(240) }).strict(),
  z.object({ kind: z.literal("separator"), style: z.enum(SEPARATOR_STYLES) }).strict(),
]);
export type SiteBlock = z.infer<typeof blockSchema>;
export type SiteBlockKind = SiteBlock["kind"];

// ─── Sections, pages, thème, document ────────────────────────────────────────

export const sectionSchema = z
  .object({
    background: backgroundSchema.default(NONE),
    /** Couleur du texte posé sur ce fond (contrôle de lisibilité). */
    textColor: palette.default("text"),
    blocks: z.array(blockSchema).max(SITE_LIMITS.blocks),
  })
  .strict();
export type SiteSection = z.infer<typeof sectionSchema>;

export const PAGE_KINDS = ["content", "tickets", "menus", "practical"] as const;
export const PAGE_KIND_LABEL: Record<(typeof PAGE_KINDS)[number], string> = {
  content: "Page composée",
  tickets: "Billetterie (automatique)",
  menus: "Menus (automatique)",
  practical: "Infos pratiques (automatique)",
};

export const pageSchema = z
  .object({
    title: line(60),
    slug: pageSlug,
    inMenu: z.boolean().default(true),
    kind: z.enum(PAGE_KINDS),
    sections: z.array(sectionSchema).max(SITE_LIMITS.sections).default([]),
  })
  .strict();
export type SitePage = z.infer<typeof pageSchema>;

export const themeSchema = z
  .object({
    colors: z.object(Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex])) as Record<PaletteKey, typeof hex>).strict(),
    fonts: z.object({ heading: z.enum(SITE_FONTS), body: z.enum(SITE_FONTS) }).strict(),
    logoAssetId: assetId.optional(),
    headerAssetId: assetId.optional(),
    background: backgroundSchema.default(NONE),
  })
  .strict();
export type SiteTheme = z.infer<typeof themeSchema>;

/** Liens d'un arbre de texte. */
function linksOf(nodes: RichNode[]): string[] {
  const inl = nodes.flatMap((n) => ("children" in n ? n.children : n.items.flat()));
  return inl.flatMap((i) => (i.href ? [i.href] : []));
}

/**
 * Document complet. La première page est l'accueil (servie à la racine du site). Contrôles
 * transverses : adresses de page uniques, liens et boutons vers des pages qui existent.
 */
export const siteDocumentSchema = z
  .object({
    theme: themeSchema,
    pages: z.array(pageSchema).min(1).max(SITE_LIMITS.pages),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const slugs = doc.pages.map((p) => p.slug);
    slugs.forEach((slug, i) => {
      if (slugs.indexOf(slug) !== i) ctx.addIssue({ code: "custom", path: ["pages", i, "slug"], message: `Adresse de page en double : « ${slug} »` });
    });
    const known = new Set(slugs);
    doc.pages.forEach((page, p) =>
      page.sections.forEach((section, s) =>
        section.blocks.forEach((block, b) => {
          const path = ["pages", p, "sections", s, "blocks", b];
          const targets =
            block.kind === "button" && "page" in block.target
              ? [block.target.page]
              : block.kind === "richText"
                ? linksOf(block.content).filter((h) => h.startsWith("page:")).map((h) => h.slice(5))
                : [];
          for (const t of targets) if (!known.has(t)) ctx.addIssue({ code: "custom", path, message: `Lien vers une page qui n'existe pas : « ${t} »` });
        })
      )
    );
  });
export type SiteDocument = z.infer<typeof siteDocumentSchema>;

/** Fonds du document, avec leur emplacement et la couleur de texte posée dessus. */
export function backgroundsOf(doc: SiteDocument): { where: string; background: SiteBackground; text: PaletteKey }[] {
  const out: { where: string; background: SiteBackground; text: PaletteKey }[] = [{ where: "Fond de page", background: doc.theme.background, text: "text" }];
  for (const page of doc.pages) {
    page.sections.forEach((section, i) => {
      out.push({ where: `${page.title} › bande ${i + 1}`, background: section.background, text: section.textColor });
      section.blocks.forEach((block) => {
        if (block.kind === "banner") out.push({ where: `${page.title} › bannière « ${block.title} »`, background: block.background, text: section.textColor });
      });
    });
  }
  return out;
}

/** Images référencées par le document (thème, fonds, blocs). */
export function assetIdsOf(doc: SiteDocument): Set<string> {
  const ids = new Set<string>();
  const bg = (b: SiteBackground) => b.kind === "image" && ids.add(b.assetId);
  if (doc.theme.logoAssetId) ids.add(doc.theme.logoAssetId);
  if (doc.theme.headerAssetId) ids.add(doc.theme.headerAssetId);
  for (const { background } of backgroundsOf(doc)) bg(background);
  for (const page of doc.pages)
    for (const section of page.sections)
      for (const block of section.blocks) {
        if (block.kind === "image") ids.add(block.image.assetId);
        if (block.kind === "gallery") block.images.forEach((i) => ids.add(i.assetId));
        if (block.kind === "cards") block.cards.forEach((c) => c.image && ids.add(c.image.assetId));
      }
  return ids;
}

/** Document de départ d'un nouveau site : thème sobre lisible, accueil avec bandeau, page Billetterie. */
export function defaultSiteDocument(title: string): SiteDocument {
  return siteDocumentSchema.parse({
    theme: {
      colors: { primary: "#5e17eb", secondary: "#1f2937", accent: "#b8860b", background: "#ffffff", text: "#1f2937" },
      fonts: { heading: "montserrat", body: "sourceSans" },
      background: { kind: "none" },
    },
    pages: [
      { title: "Accueil", slug: "accueil", kind: "content", sections: [{ blocks: [{ kind: "hero", title: title.slice(0, 120) }] }] },
      { title: "Billetterie", slug: "billetterie", kind: "tickets" },
    ],
  });
}
