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

export const SITE_FONTS = ["montserrat", "playfair", "cormorant", "lora", "inter", "sourceSans", "cinzel"] as const;
export type SiteFont = (typeof SITE_FONTS)[number];
export const SITE_FONT_LABEL: Record<SiteFont, string> = {
  montserrat: "Montserrat",
  playfair: "Playfair Display",
  cormorant: "Cormorant Garamond",
  lora: "Lora",
  inter: "Inter",
  sourceSans: "Source Sans 3",
  cinzel: "Cinzel",
};

export const GRADIENT_DIRECTIONS = ["vertical", "horizontal", "diagonal", "radial"] as const;
export const BUTTON_STYLES = ["filled", "outline", "subtle"] as const;
export const BUTTON_STYLE_LABEL: Record<(typeof BUTTON_STYLES)[number], string> = { filled: "Plein", outline: "Contour", subtle: "Discret" };
export const GALLERY_LAYOUTS = ["grid", "round"] as const;
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
  .describe("Couleur #RRGGBB")
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB")
  .transform((v) => v.toLowerCase());
const assetId = z.string().regex(/^[a-z0-9]{20,40}$/, "Image inconnue").describe("Identifiant d'une image déjà téléversée sur le site");
const line = (max: number, d?: string) => {
  const f = z.string().trim().min(1).max(max);
  return d ? f.describe(d) : f;
};
const optionalLine = (max: number, d?: string) => {
  const f = z.string().trim().max(max).optional();
  return d ? f.describe(d) : f;
};
const palette = z.enum(PALETTE_KEYS).describe("Clé de la palette du thème (jamais une couleur libre)");
/** Identifiant d'ancre d'une bande ou d'un bloc (cible d'un bouton `{ anchor }`). */
export const anchorSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Ancre : lettres minuscules, chiffres et tirets")
  .max(40);
const anchorField = { anchor: anchorSlug.optional().describe("Ancre (identifiant court, unique sur la page) pour qu'un bouton y mène") };
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
      stops: z.array(palette).min(2).max(3).describe("2 ou 3 clés de palette, dans l'ordre du dégradé"),
      direction: z.enum(GRADIENT_DIRECTIONS).describe("Sens du dégradé"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("image"),
      assetId,
      veil: palette.describe("Couleur du voile posé sur l'image (lisibilité du texte)"),
      opacity: z.number().min(0.2).max(0.9).describe("Opacité du voile, de 0.2 à 0.9"),
      fixed: z.boolean().default(false).describe("Image fixe au défilement (désactivé sur mobile)"),
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

const imageRef = z.object({ assetId, alt: line(200, "Texte alternatif (accessibilité), obligatoire"), caption: optionalLine(200, "Légende sous l'image") }).strict();
const items = z.array(line(200)).max(SITE_LIMITS.listItems);

/** Destination d'un bouton : page du site, lien https, courriel, téléphone, ancre de la page, ou inscription. */
export const buttonTargetSchema = z.union([
  z.object({ page: pageSlug }).strict(),
  z.object({ url: z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/, "Lien externe en https seulement").describe("Lien externe, https seulement") }).strict(),
  z.object({ mailto: z.string().trim().max(200).regex(/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/, "Adresse email invalide").describe("Adresse email") }).strict(),
  z.object({ tel: z.string().trim().regex(/^\+?[0-9][0-9 .-]{3,24}$/, "Numéro : chiffres, espaces, +, - et . seulement").describe("Numéro de téléphone (chiffres, espaces, +, -, .)") }).strict(),
  z.object({ anchor: anchorSlug.describe("Ancre d'une bande ou d'un bloc de la même page") }).strict(),
  z.object({ booking: z.literal(true) }).strict(),
]);
export type ButtonTarget = z.infer<typeof buttonTargetSchema>;
const buttonStyle = z.enum(BUTTON_STYLES).optional().describe("Plein (défaut), contour ou discret");
/** Bouton imbriqué (bandeau, bannière). */
export const buttonSchema = z.object({ label: line(40, "Texte du bouton"), target: buttonTargetSchema, style: buttonStyle }).strict();
export type SiteButton = z.infer<typeof buttonSchema>;

export const blockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("hero"),
      title: line(120, "Titre du bandeau"),
      tagline: optionalLine(240, "Phrase d'accroche sous le titre"),
      showDateLocation: z.boolean().default(true).describe("Afficher la date et le lieu (vrai par défaut)"),
      showCountdown: z.boolean().default(false).describe("Afficher un compte à rebours"),
      buttonLabel: optionalLine(40, "Libellé du bouton d'inscription"),
      background: backgroundSchema.optional().describe("Fond du bandeau (couleur, dégradé ou image sous voile)"),
      button: buttonSchema.optional().describe("Bouton du bandeau ; à défaut, le bouton d'inscription (buttonLabel)"),
      ...anchorField,
    })
    .strict(),
  z.object({ kind: z.literal("richText"), content: richTextSchema.describe("Arbre de texte (outil MCP : fournir `markdown`)"), ...anchorField }).strict(),
  z.object({ kind: z.literal("image"), image: imageRef, ...anchorField }).strict(),
  z
    .object({
      kind: z.literal("gallery"),
      title: optionalLine(120, "Titre de la galerie"),
      layout: z.enum(GALLERY_LAYOUTS).optional().describe("grid (défaut) : grille carrée ; round : vignettes rondes"),
      images: z.array(imageRef).min(1).max(SITE_LIMITS.gallery),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("palette"),
      title: optionalLine(120, "Titre du bloc"),
      // Seule couleur libre : affichée en pastille, jamais appliquée au texte ni à un fond.
      swatches: z.array(z.object({ label: line(60, "Nom de la couleur"), color: hex }).strict()).describe("Pastilles de couleur").min(1).max(SITE_LIMITS.swatches),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("cards"),
      title: optionalLine(120, "Titre de la section de cartes"),
      columns: z.number().int().min(2).max(4).optional().describe("Nombre de colonnes sur grand écran : 2 (défaut), 3 ou 4"),
      cards: z
        .array(
          z
            .object({
              title: line(120, "Titre de la carte"),
              text: optionalLine(300, "Texte court sous le titre"),
              icon: z.enum(SITE_ICONS).optional().describe("Pictogramme de la carte"),
              image: imageRef.optional().describe("Image de la carte"),
              items: items.describe("Lignes de la carte"),
            })
            .strict()
        )
        .min(1)
        .max(SITE_LIMITS.cards)
        .describe("Cartes côte à côte"),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("doDont"),
      doTitle: line(80, "Titre de la colonne « à faire »"),
      doItems: items.describe("Éléments à faire"),
      dontTitle: line(80, "Titre de la colonne « à éviter »"),
      dontItems: items.describe("Éléments à éviter"),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("icons"),
      title: optionalLine(120, "Titre du bloc"),
      items: z
        .array(z.object({ icon: z.enum(SITE_ICONS).describe("Pictogramme"), label: line(120, "Libellé"), description: optionalLine(200, "Précision sous le libellé") }).strict())
        .min(1)
        .max(SITE_LIMITS.listItems),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("faq"),
      title: optionalLine(120, "Titre de la section de questions"),
      items: z.array(z.object({ question: line(200, "Question"), answer: z.string().trim().min(1).max(2000).describe("Réponse (texte simple)") }).strict()).min(1).max(SITE_LIMITS.faq),
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("button"),
      label: line(40, "Texte du bouton"),
      target: buttonTargetSchema,
      style: buttonStyle,
      ...anchorField,
    })
    .strict(),
  z
    .object({
      kind: z.literal("banner"),
      background: backgroundSchema,
      title: line(120, "Titre de la bannière"),
      tagline: optionalLine(240, "Phrase sous le titre"),
      secondary: optionalLine(240, "Ligne secondaire sous la phrase"),
      button: buttonSchema.optional().describe("Bouton de la bannière"),
      ...anchorField,
    })
    .strict(),
  z.object({ kind: z.literal("separator"), style: z.enum(SEPARATOR_STYLES).describe("Style du séparateur"), ...anchorField }).strict(),
]);
export type SiteBlock = z.infer<typeof blockSchema>;
export type SiteBlockKind = SiteBlock["kind"];

// ─── Sections, pages, thème, document ────────────────────────────────────────

export const sectionSchema = z
  .object({
    background: backgroundSchema.default(NONE).describe("Fond de la bande"),
    /** Couleur du texte posé sur ce fond (contrôle de lisibilité). */
    textColor: palette.default("text").describe("Couleur du texte posé sur ce fond (contrôle de lisibilité)"),
    blocks: z.array(blockSchema).max(SITE_LIMITS.blocks),
    ...anchorField,
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
    title: line(60, "Titre de la page"),
    slug: pageSlug.describe("Adresse de la page (minuscules, chiffres, tirets), unique"),
    inMenu: z.boolean().default(true).describe("Page présente dans le menu"),
    kind: z.enum(PAGE_KINDS).describe("content : page composée de bandes et blocs ; tickets, menus, practical : pages automatiques"),
    sections: z.array(sectionSchema).max(SITE_LIMITS.sections).default([]),
  })
  .strict();
export type SitePage = z.infer<typeof pageSchema>;

export const themeSchema = z
  .object({
    colors: z.object(Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex])) as Record<PaletteKey, typeof hex>).strict(),
    fonts: z.object({ heading: z.enum(SITE_FONTS).describe("Police des titres"), body: z.enum(SITE_FONTS).describe("Police du texte") }).strict(),
    logoAssetId: assetId.optional().describe("Logo (image du site)"),
    headerAssetId: assetId.optional().describe("Image d'en-tête (image du site)"),
    background: backgroundSchema.default(NONE).describe("Fond de page"),
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
    doc.pages.forEach((page, p) => {
      const anchors = new Set<string>();
      const buttons: { target: ButtonTarget; path: (string | number)[] }[] = [];
      const declare = (anchor: string | undefined, path: (string | number)[]) => {
        if (!anchor) return;
        if (anchors.has(anchor)) ctx.addIssue({ code: "custom", path: [...path, "anchor"], message: `Ancre en double sur la page « ${page.slug} » : « ${anchor} »` });
        anchors.add(anchor);
      };
      page.sections.forEach((section, s) => {
        declare(section.anchor, ["pages", p, "sections", s]);
        section.blocks.forEach((block, b) => {
          const path = ["pages", p, "sections", s, "blocks", b];
          declare(block.anchor, path);
          if (block.kind === "button") buttons.push({ target: block.target, path: [...path, "target"] });
          if ((block.kind === "hero" || block.kind === "banner") && block.button) buttons.push({ target: block.button.target, path: [...path, "button", "target"] });
          if (block.kind === "richText") {
            for (const h of linksOf(block.content).filter((h) => h.startsWith("page:"))) if (!known.has(h.slice(5))) ctx.addIssue({ code: "custom", path, message: `Lien vers une page qui n'existe pas : « ${h.slice(5)} »` });
          }
        });
      });
      for (const { target, path } of buttons) {
        if ("page" in target && !known.has(target.page)) ctx.addIssue({ code: "custom", path, message: `Lien vers une page qui n'existe pas : « ${target.page} »` });
        if ("anchor" in target && !anchors.has(target.anchor)) ctx.addIssue({ code: "custom", path, message: `Ancre introuvable sur cette page : « ${target.anchor} » (ancres existantes : ${[...anchors].join(", ") || "aucune"})` });
      }
    });
  });
export type SiteDocument = z.infer<typeof siteDocumentSchema>;

/** Fonds du document, avec leur emplacement et la couleur de texte posée dessus. */
/** Boutons d'un bloc, avec le fond sur lequel leur texte est posé. */
function buttonsOf(block: SiteBlock, sectionBg: SiteBackground): { label: string; style: (typeof BUTTON_STYLES)[number]; on: SiteBackground }[] {
  if (block.kind === "button") return [{ label: block.label, style: block.style ?? "filled", on: sectionBg }];
  if (block.kind === "hero" && block.button) return [{ label: block.button.label, style: block.button.style ?? "filled", on: block.background ?? sectionBg }];
  if (block.kind === "banner" && block.button) return [{ label: block.button.label, style: block.button.style ?? "filled", on: block.background }];
  return [];
}

export function backgroundsOf(doc: SiteDocument): { where: string; background: SiteBackground; text: PaletteKey }[] {
  const out: { where: string; background: SiteBackground; text: PaletteKey }[] = [{ where: "Fond de page", background: doc.theme.background, text: "text" }];
  for (const page of doc.pages) {
    page.sections.forEach((section, i) => {
      out.push({ where: `${page.title} › bande ${i + 1}`, background: section.background, text: section.textColor });
      section.blocks.forEach((block) => {
        if (block.kind === "hero" && block.background) out.push({ where: `${page.title} › bandeau « ${block.title} »`, background: block.background, text: section.textColor });
        // Bouton « contour » ou « discret » : son texte est la couleur principale, posée sur le fond du bloc.
        for (const b of buttonsOf(block, section.background)) {
          if (b.style !== "filled") out.push({ where: `${page.title} › bouton « ${b.label} »`, background: b.on, text: "primary" });
        }
        if (block.kind === "banner") out.push({ where: `${page.title} › bannière « ${block.title} »`, background: block.background, text: section.textColor });
      });
    });
  }
  return out;
}

/** Emplacements où chaque image est utilisée : thème (logo, en-tête, fond), page › bande › bloc. */
export function assetUsagesOf(doc: SiteDocument): { assetId: string; where: string }[] {
  const out: { assetId: string; where: string }[] = [];
  const add = (assetId: string | undefined, where: string) => assetId && out.push({ assetId, where });
  const bg = (b: SiteBackground | undefined, where: string) => b?.kind === "image" && add(b.assetId, where);
  add(doc.theme.logoAssetId, "thème › logo");
  add(doc.theme.headerAssetId, "thème › en-tête");
  bg(doc.theme.background, "thème › fond de page");
  for (const page of doc.pages)
    page.sections.forEach((section, s) => {
      const band = `${page.title} › bande ${s + 1}`;
      bg(section.background, `${band} › fond`);
      section.blocks.forEach((block, b) => {
        const at = `${band} › bloc ${b + 1} (${block.kind})`;
        if (block.kind === "image") add(block.image.assetId, at);
        if (block.kind === "gallery") block.images.forEach((i) => add(i.assetId, at));
        if (block.kind === "cards") block.cards.forEach((c) => add(c.image?.assetId, at));
        if (block.kind === "banner") bg(block.background, `${at} › fond`);
        if (block.kind === "hero") bg(block.background, `${at} › fond`);
      });
    });
  return out;
}

/** Copie du document dont chaque identifiant d'image est remplacé (duplication, import) ; un identifiant absent de la table est conservé. */
export function remapAssetIds(doc: SiteDocument, map: ReadonlyMap<string, string>): SiteDocument {
  const next = structuredClone(doc);
  const id = (value: string) => map.get(value) ?? value;
  const bg = (b: SiteBackground | undefined) => {
    if (b?.kind === "image") b.assetId = id(b.assetId);
  };
  if (next.theme.logoAssetId) next.theme.logoAssetId = id(next.theme.logoAssetId);
  if (next.theme.headerAssetId) next.theme.headerAssetId = id(next.theme.headerAssetId);
  bg(next.theme.background);
  for (const page of next.pages)
    for (const section of page.sections) {
      bg(section.background);
      for (const block of section.blocks) {
        if (block.kind === "image") block.image.assetId = id(block.image.assetId);
        if (block.kind === "gallery") block.images.forEach((i) => void (i.assetId = id(i.assetId)));
        if (block.kind === "cards") block.cards.forEach((c) => c.image && void (c.image.assetId = id(c.image.assetId)));
        if (block.kind === "banner" || block.kind === "hero") bg(block.background);
      }
    }
  return next;
}

/** Images référencées par le document (thème, fonds, blocs). */
export function assetIdsOf(doc: SiteDocument): Set<string> {
  return new Set(assetUsagesOf(doc).map((u) => u.assetId));
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
