/**
 * Tests — document d'un site d'événement (spec 084, lot 1a) : schémas des blocs, liens, palette,
 * bornes ; texte riche sans HTML ; contraste WCAG au point le moins favorable.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_CONTRAST,
  RichTextError,
  assetIdsOf,
  blockSchema,
  contrastIssues,
  contrastRatio,
  defaultSiteDocument,
  hexToRgb,
  parseRichText,
  richTextToMarkdown,
  siteDocumentSchema,
  worstContrast,
  type SiteDocument,
} from "../schemas";

const ASSET = "ckabcdefghijklmnopqrstuv";
const NDT = {
  primary: "#6b1d2a",
  secondary: "#4b5320",
  accent: "#c9a227",
  background: "#faf6ee",
  text: "#2b1a12",
};

const doc = (over: Partial<SiteDocument> = {}): SiteDocument =>
  siteDocumentSchema.parse({ ...defaultSiteDocument("Nuit de la traversée"), ...over });

describe("schémas du document", () => {
  it("document par défaut valide et lisible", () => {
    const d = defaultSiteDocument("Nuit de la traversée");
    expect(d.pages.map((p) => p.slug)).toEqual(["accueil", "billetterie"]);
    expect(contrastIssues(d)).toEqual([]);
  });

  it("liens : https, mailto et pages du site seulement", () => {
    const button = (href: string) => blockSchema.safeParse({ kind: "richText", content: [{ type: "p", children: [{ text: "x", href }] }] }).success;
    expect(button("https://iccrennes.fr")).toBe(true);
    expect(button("mailto:contact@iccrennes.fr")).toBe(true);
    expect(button("page:dress-code")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://iccrennes.fr", "//evil.fr", "page:../admin"]) expect(button(bad), bad).toBe(false);
  });

  it("aucune couleur libre hors pastilles ; aucune propriété inconnue", () => {
    expect(blockSchema.safeParse({ kind: "banner", title: "Dress code", background: { kind: "color", color: "#ff0000" } }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "banner", title: "Dress code", background: { kind: "color", color: "primary" }, style: "color:red" }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "palette", swatches: [{ label: "Vert olive", color: "#4B5320" }] }).success).toBe(true);
    expect(blockSchema.safeParse({ kind: "palette", swatches: [{ label: "Vert", color: "red" }] }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "html", html: "<script>" }).success).toBe(false);
  });

  it("bornes : 8 pages, 24 images par galerie, adresses uniques, liens vers des pages existantes", () => {
    const page = (slug: string) => ({ title: slug, slug, kind: "content" });
    expect(siteDocumentSchema.safeParse({ ...doc(), pages: Array.from({ length: 9 }, (_, i) => page(`p${i}`)) }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "gallery", images: Array.from({ length: 25 }, () => ({ assetId: ASSET, alt: "x" })) }).success).toBe(false);
    expect(siteDocumentSchema.safeParse({ ...doc(), pages: [page("a"), page("a")] }).success).toBe(false);
    const linked = siteDocumentSchema.safeParse({
      ...doc(),
      pages: [{ ...page("accueil"), sections: [{ blocks: [{ kind: "button", label: "Dress code", target: { page: "dress-code" } }] }] }],
    });
    expect(linked.success).toBe(false);
  });

  it("images référencées : thème, fonds, blocs", () => {
    const d = doc({
      theme: { ...doc().theme, logoAssetId: ASSET, background: { kind: "image", assetId: "ckzzzzzzzzzzzzzzzzzzzzzz", veil: "primary", opacity: 0.6, fixed: false } },
    });
    expect([...assetIdsOf(d)].sort()).toEqual([ASSET, "ckzzzzzzzzzzzzzzzzzzzzzz"].sort());
  });
});

describe("texte riche", () => {
  it("titres, listes, gras, italique, liens", () => {
    const nodes = parseRichText("## Le dress code\n\nTenue **élégante** et *harmonisée*.\n\n- Robes longues\n- [Voir les menus](page:menus)\n\n1. Arriver tôt");
    expect(nodes.map((n) => n.type)).toEqual(["h2", "p", "ul", "ol"]);
    expect(nodes[1]).toEqual({ type: "p", children: [{ text: "Tenue " }, { text: "élégante", bold: true }, { text: " et " }, { text: "harmonisée", italic: true }, { text: "." }] });
    expect(richTextToMarkdown(nodes)).toBe("## Le dress code\n\nTenue **élégante** et *harmonisée*.\n\n- Robes longues\n- [Voir les menus](page:menus)\n\n1. Arriver tôt");
  });

  it("le HTML saisi reste du texte ; un lien interdit est refusé", () => {
    const [p] = parseRichText('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    expect(p).toEqual({ type: "p", children: [{ text: '<img src=x onerror="alert(1)"> <script>alert(1)</script>' }] });
    expect(() => parseRichText("[clic](javascript:alert(1))")).toThrow(RichTextError);
    expect(() => parseRichText("[clic](http://site.fr)")).toThrow(RichTextError);
  });

  it("une marque non fermée reste du texte", () => {
    expect(parseRichText("2 * 3 = 6 et **gras")).toEqual([{ type: "p", children: [{ text: "2 * 3 = 6 et **gras" }] }]);
  });
});

describe("contraste", () => {
  it("valeurs de référence WCAG", () => {
    expect(contrastRatio(hexToRgb("#000000"), hexToRgb("#ffffff"))).toBeCloseTo(21, 1);
    expect(contrastRatio(hexToRgb("#777777"), hexToRgb("#ffffff"))).toBeCloseTo(4.48, 1);
  });

  it("dégradé : chacune de ses couleurs ; image : voile sur noir et sur blanc", () => {
    expect(worstContrast({ kind: "gradient", stops: ["primary", "background"], direction: "vertical" }, "background", NDT)).toBeLessThan(MIN_CONTRAST);
    expect(worstContrast({ kind: "gradient", stops: ["primary", "secondary"], direction: "diagonal" }, "background", NDT)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(worstContrast({ kind: "image", assetId: ASSET, veil: "primary", opacity: 0.85, fixed: false }, "background", NDT)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(worstContrast({ kind: "image", assetId: ASSET, veil: "primary", opacity: 0.3, fixed: false }, "background", NDT)).toBeLessThan(MIN_CONTRAST);
  });

  it("refus nommé avec une piste", () => {
    const d = doc({
      theme: { ...doc().theme, colors: NDT },
      pages: [
        {
          title: "Dress code",
          slug: "dress-code",
          inMenu: true,
          kind: "content",
          sections: [{ background: { kind: "color", color: "accent" }, textColor: "background", blocks: [{ kind: "separator", style: "goldDiamond" }] }],
        },
      ],
    });
    const issues = contrastIssues(d);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Dress code › bande 1");
    expect(issues[0].message).toContain("autre couleur");
  });
});
