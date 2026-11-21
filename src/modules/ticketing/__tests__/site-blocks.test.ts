/**
 * Tests — boutons et blocs enrichis du site d'événement (spec 084) : cibles de bouton, styles,
 * ancres, nouveaux champs optionnels, lisibilité des boutons contour/discret, rétrocompatibilité.
 */
import { describe, it, expect } from "vitest";
import { SITE_FONTS, blockSchema, contrastIssues, defaultSiteDocument, siteDocumentSchema, describeSite, type SiteDocument } from "../schemas";

const A = "a".repeat(25);
const hero = { kind: "hero", title: "Nuit" };

function doc(blocks: unknown[], section: Record<string, unknown> = {}, extraPages: unknown[] = []): SiteDocument {
  const base = defaultSiteDocument("Nuit");
  return siteDocumentSchema.parse({
    theme: base.theme,
    pages: [{ title: "Accueil", slug: "accueil", kind: "content", sections: [{ blocks, ...section }] }, ...extraPages],
  });
}
const parse = (blocks: unknown[], section?: Record<string, unknown>) => siteDocumentSchema.safeParse({ ...defaultSiteDocument("N"), pages: [{ title: "Accueil", slug: "accueil", kind: "content", sections: [{ blocks, ...section }] }, { title: "Infos", slug: "infos", kind: "practical" }] });
const button = (target: unknown, extra: Record<string, unknown> = {}) => ({ kind: "button", label: "Aller", target, ...extra });

describe("cibles de bouton", () => {
  it.each([
    [{ page: "infos" }],
    [{ url: "https://exemple.org/billets?a=1" }],
    [{ mailto: "contact@exemple.org" }],
    [{ tel: "+33 6 12 34 56 78" }],
    [{ tel: "02.99.00.11.22" }],
    [{ tel: "02-99-00-11-22" }],
    [{ booking: true }],
  ])("accepte %j", (target) => expect(parse([button(target)]).success).toBe(true));

  it.each([
    [{ url: "http://exemple.org" }],
    [{ url: "javascript:alert(1)" }],
    [{ url: "https://exemple.org/ a" }],
    [{ url: "data:text/html,<b>x</b>" }],
    [{ mailto: "pas-un-email" }],
    [{ mailto: "a@b.c d" }],
    [{ tel: "javascript:alert(1)" }],
    [{ tel: "06 12 ab 34" }],
    [{ tel: "12" }],
    [{ anchor: "Pas Valide" }],
    [{ page: "infos", url: "https://exemple.org" }],
    [{ booking: false }],
    [{ href: "https://exemple.org" }],
  ])("refuse %j", (target) => expect(parse([button(target)]).success).toBe(false));

  it("page inconnue refusée", () => expect(parse([button({ page: "nope" })]).success).toBe(false));

  it("styles : plein, contour, discret ; autre refusé ; absent = plein", () => {
    for (const style of ["filled", "outline", "subtle"]) expect(parse([button({ booking: true }, { style })]).success).toBe(true);
    expect(parse([button({ booking: true }, { style: "neon" })]).success).toBe(false);
    expect(parse([button({ booking: true })]).success).toBe(true);
  });
});

describe("ancres", () => {
  it("uniques par page, sur bandes et blocs ; les mêmes sur deux pages sont permises", () => {
    expect(parse([{ ...hero, anchor: "haut" }, { kind: "separator", style: "line", anchor: "haut" }]).success).toBe(false);
    expect(parse([{ ...hero, anchor: "haut" }], { anchor: "haut" }).success).toBe(false);
    expect(parse([{ ...hero, anchor: "haut" }], { anchor: "bande" }).success).toBe(true);
    const twoPages = siteDocumentSchema.safeParse({
      ...defaultSiteDocument("N"),
      pages: [
        { title: "A", slug: "a", kind: "content", sections: [{ blocks: [{ ...hero, anchor: "haut" }] }] },
        { title: "B", slug: "b", kind: "content", sections: [{ blocks: [{ ...hero, anchor: "haut" }] }] },
      ],
    });
    expect(twoPages.success).toBe(true);
  });

  it("un bouton vers une ancre exige qu'elle existe sur la même page", () => {
    expect(parse([{ ...hero, anchor: "programme" }, button({ anchor: "programme" })]).success).toBe(true);
    expect(parse([{ ...hero, anchor: "programme" }], { anchor: "bande" }).success).toBe(true);
    const missing = parse([button({ anchor: "programme" })]);
    expect(missing.success).toBe(false);
    expect(JSON.stringify(missing.error?.issues)).toContain("Ancre introuvable");
    // Ancre d'une autre page : refusée.
    const other = siteDocumentSchema.safeParse({
      ...defaultSiteDocument("N"),
      pages: [
        { title: "A", slug: "a", kind: "content", sections: [{ blocks: [button({ anchor: "ailleurs" })] }] },
        { title: "B", slug: "b", kind: "content", sections: [{ blocks: [{ ...hero, anchor: "ailleurs" }] }] },
      ],
    });
    expect(other.success).toBe(false);
  });

  it("ancre d'une bande visée par un bouton de la même page", () => {
    expect(parse([button({ anchor: "bande" })], { anchor: "bande" }).success).toBe(true);
  });

  it("format de l'ancre", () => {
    for (const anchor of ["Haut", "a b", "a_b", "-a", "a".repeat(41), ""]) expect(parse([{ ...hero, anchor }]).success, anchor).toBe(false);
  });
});

describe("bandeau et bannière", () => {
  it("hero : bouton { label, target, style } ; buttonLabel toujours accepté", () => {
    expect(parse([{ ...hero, button: { label: "Programme", target: { anchor: "prog" }, style: "outline" }, anchor: "prog" }]).success).toBe(true);
    expect(parse([{ ...hero, buttonLabel: "S'inscrire" }]).success).toBe(true);
    expect(parse([{ ...hero, button: { label: "x", target: { url: "http://non" } } }]).success).toBe(false);
    expect(parse([{ ...hero, button: { label: "x", target: { booking: true }, extra: 1 } }]).success).toBe(false);
  });

  it("hero : le bouton vers une page ou une ancre est vérifié comme les autres", () => {
    expect(parse([{ ...hero, button: { label: "x", target: { page: "nope" } } }]).success).toBe(false);
    expect(parse([{ ...hero, button: { label: "x", target: { anchor: "rien" } } }]).success).toBe(false);
  });

  it("banner : secondary et button", () => {
    const banner = { kind: "banner", background: { kind: "color", color: "primary" }, title: "T", secondary: "Ligne", button: { label: "Go", target: { mailto: "a@b.fr" } } };
    expect(parse([banner], { textColor: "background" }).success).toBe(true);
    expect(parse([{ ...banner, secondary: "x".repeat(241) }], { textColor: "background" }).success).toBe(false);
  });
});

describe("cartes, pictogrammes, questions, galerie", () => {
  const card = { title: "Elle", items: ["Robe"] };
  it("cards : title, columns 2 à 4, text par carte", () => {
    expect(parse([{ kind: "cards", title: "Tenues", columns: 3, cards: [{ ...card, text: "Sobre" }] }]).success).toBe(true);
    for (const columns of [1, 5, 2.5, "3"]) expect(parse([{ kind: "cards", columns, cards: [card] }]).success, String(columns)).toBe(false);
    expect(parse([{ kind: "cards", cards: [{ ...card, text: "x".repeat(301) }] }]).success).toBe(false);
    expect(parse([{ kind: "cards", cards: [{ ...card, image: { assetId: A, alt: "Photo" } }] }]).success).toBe(true);
  });

  it("icons : description par élément ; faq : title", () => {
    expect(parse([{ kind: "icons", items: [{ icon: "star", label: "Parking", description: "Gratuit" }] }]).success).toBe(true);
    expect(parse([{ kind: "icons", items: [{ icon: "star", label: "P", description: "x".repeat(201) }] }]).success).toBe(false);
    expect(parse([{ kind: "faq", title: "Questions", items: [{ question: "Q", answer: "R" }] }]).success).toBe(true);
  });

  it("gallery : layout grid ou round", () => {
    const images = [{ assetId: A, alt: "Un" }];
    for (const layout of ["grid", "round"]) expect(parse([{ kind: "gallery", layout, images }]).success).toBe(true);
    expect(parse([{ kind: "gallery", layout: "masonry", images }]).success).toBe(false);
    expect(parse([{ kind: "gallery", images }]).success).toBe(true);
  });

  it("clé inconnue toujours refusée (strict)", () => {
    expect(blockSchema.safeParse({ kind: "gallery", images: [{ assetId: A, alt: "x" }], rounded: true }).success).toBe(false);
  });
});

describe("police Cinzel", () => {
  it("est proposée au thème", () => {
    expect(SITE_FONTS).toContain("cinzel");
    const d = defaultSiteDocument("N");
    d.theme.fonts.heading = "cinzel";
    expect(siteDocumentSchema.safeParse(d).success).toBe(true);
  });
});

describe("lisibilité des boutons contour et discret", () => {
  // Principale = #5e17eb sur fond blanc : lisible. On pose un fond sombre derrière.
  const dark = { kind: "color", color: "secondary" };
  it("contour ou discret : texte « principale » contrôlé sur le fond de la bande", () => {
    const outline = doc([button({ booking: true }, { style: "outline" })], { background: dark });
    expect(contrastIssues(outline).some((i) => i.where.includes("bouton « Aller »"))).toBe(true);
    const subtle = doc([button({ booking: true }, { style: "subtle" })], { background: dark });
    expect(contrastIssues(subtle).some((i) => i.where.includes("bouton"))).toBe(true);
  });

  it("plein : seule la couleur du texte du bouton est calculée, aucun contrôle de fond", () => {
    expect(contrastIssues(doc([button({ booking: true })], { background: dark })).some((i) => i.where.includes("bouton"))).toBe(false);
  });

  it("lisible sur un fond clair ; vérifié aussi dans le bandeau et la bannière", () => {
    expect(contrastIssues(doc([button({ booking: true }, { style: "outline" })])).filter((i) => i.where.includes("bouton"))).toEqual([]);
    const inHero = doc([{ ...hero, background: dark, button: { label: "Go", target: { booking: true }, style: "outline" } }]);
    expect(contrastIssues(inHero).some((i) => i.where.includes("bouton « Go »"))).toBe(true);
    const banner = doc([{ kind: "banner", background: dark, title: "T", button: { label: "Go", target: { booking: true }, style: "subtle" } }], { textColor: "background" });
    expect(contrastIssues(banner).some((i) => i.where.includes("bouton « Go »"))).toBe(true);
  });
});

describe("rétrocompatibilité", () => {
  it("un document d'avant les nouveaux champs reste valide, inchangé après analyse", () => {
    const legacy = {
      theme: defaultSiteDocument("N").theme,
      pages: [
        {
          title: "Accueil", slug: "accueil", inMenu: true, kind: "content",
          sections: [{ background: { kind: "none" }, textColor: "text", blocks: [
            { kind: "hero", title: "Nuit", showDateLocation: true, showCountdown: false, buttonLabel: "Go" },
            { kind: "cards", cards: [{ title: "A", items: ["x"] }] },
            { kind: "button", label: "Plus", target: { page: "infos" } },
            { kind: "button", label: "Réserver", target: { booking: true } },
          ] }],
        },
        { title: "Infos", slug: "infos", inMenu: true, kind: "practical", sections: [] },
      ],
    };
    const parsed = siteDocumentSchema.parse(legacy);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(legacy);
  });

  it("describe_site_blocks reflète les nouveaux champs", () => {
    const paths = (k: string) => describeSite(k)[0].fields.map((f) => f.path);
    expect(paths("button")).toEqual(expect.arrayContaining(["style", "anchor", "target{url}.url", "target{tel}.tel", "target{anchor}.anchor"]));
    expect(paths("hero")).toEqual(expect.arrayContaining(["button.label", "anchor"]));
    expect(paths("cards")).toEqual(expect.arrayContaining(["title", "columns", "cards[].text"]));
    expect(paths("icons")).toContain("items[].description");
    expect(paths("gallery")).toContain("layout");
    expect(paths("banner")).toEqual(expect.arrayContaining(["secondary", "button.label"]));
    expect(describeSite("theme")[0].fields.find((f) => f.path === "fonts.heading")!.values).toContain("cinzel");
  });
});
