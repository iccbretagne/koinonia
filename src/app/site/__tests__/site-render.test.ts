/**
 * Tests — rendu du site d'événement (spec 084, lot 2) : chaque bloc sans HTML brut, pages
 * automatiques sans donnée personnelle, « Événement terminé », document « Dress code ».
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { assetIdsOf, assetUsagesOf, contrastIssues, siteDocumentSchema, defaultSiteDocument, SITE_ICONS, type PublicEvent, type SiteDocument } from "@/modules/ticketing/schemas";

vi.mock("../_components/fonts", () => ({ fontClasses: () => "", fontFamily: () => "sans-serif" }));
const { default: SiteRenderer } = await import("../_components/SiteRenderer");

const A = "a".repeat(25);
const B = "b".repeat(25);
const RAW = "<b>x</b>";

const EVENT = {
  id: "e1", churchSlug: "icc", churchName: "ICC", slug: "nuit", title: "Nuit", description: "Une belle nuit",
  location: "Rennes", hasPoster: false, startsAt: "2030-12-31T20:00:00.000Z", endsAt: "2031-01-01T06:00:00.000Z",
  registrationDeadline: null, status: "OPEN", open: true, closedReason: null, seatsRemaining: 10,
  tariffs: [{ ageGroup: "ADULT", price: 10 }], methods: ["WERO", "CASH"], allowUnaccompaniedMinors: false, optionPaymentDeadline: null,
  options: [
    { id: "o1", label: "Repas", description: "Dîner assis", type: "CHOICE", scope: "PARTICIPANT", price: 8, remaining: 5, refundable: true, refundDeadline: null, choiceGroup: null,
      variants: [
        { id: "v1", label: "Poulet", description: null, allergens: "gluten", remaining: 0 },
        { id: "v2", label: "Végétarien", description: "Curry", allergens: null, remaining: null },
      ] },
  ],
  questions: [],
  // Données qui ne doivent jamais sortir : absentes du type public, ajoutées pour vérifier le rendu.
  contactEmail: "secret@example.org", contactPhone: "06 11 22 33 44", attendees: ["Jeanne Dupont"],
} as unknown as PublicEvent;

function render(document: SiteDocument, pageSlug?: string, event: PublicEvent | null = EVENT, ended = false) {
  return renderToString(createElement(SiteRenderer, { document, event, title: "Nuit", churchSlug: "icc", eventSlug: "nuit", ended, pageSlug, assetUrl: (id: string, w?: number) => `/a/${id}${w ? `?w=${w}` : ""}`, pageHref: (s: string) => `/${s}` }));
}

const theme = defaultSiteDocument("Nuit").theme;
const img = { assetId: A, alt: RAW, caption: RAW };

function allBlocks(): SiteDocument {
  return siteDocumentSchema.parse({
    theme,
    pages: [
      {
        title: "Accueil", slug: "accueil", kind: "content",
        sections: [{
          blocks: [
            { kind: "hero", title: RAW, tagline: RAW, showCountdown: true },
            { kind: "richText", content: [{ type: "p", children: [{ text: RAW }] }, { type: "ul", items: [[{ text: RAW, href: "https://example.org" }]] }] },
            { kind: "image", image: img },
            { kind: "gallery", title: RAW, images: [img, { ...img, assetId: B }] },
            { kind: "palette", title: RAW, swatches: [{ label: RAW, color: "#112233" }] },
            { kind: "cards", cards: [{ title: RAW, icon: "shirt", items: [RAW] }] },
            { kind: "doDont", doTitle: RAW, doItems: [RAW], dontTitle: RAW, dontItems: [RAW] },
            { kind: "icons", title: RAW, items: SITE_ICONS.map((icon) => ({ icon, label: RAW })).slice(0, 12) },
            { kind: "faq", items: [{ question: RAW, answer: RAW }] },
            { kind: "button", label: RAW, target: { booking: true } },
            { kind: "banner", background: { kind: "gradient", stops: ["primary", "secondary"], direction: "diagonal" }, title: RAW },
            { kind: "separator", style: "goldDiamond" },
          ],
        }],
      },
    ],
  });
}

describe("rendu des blocs", () => {
  const html = render(allBlocks());

  it("n'insère jamais de HTML saisi : tout est échappé", () => {
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toMatch(/<script/i);
  });

  it("galerie et images en chargement différé, pictogrammes en SVG", () => {
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<svg");
    expect(html).toContain("/a/" + B);
  });

  it("applique la couleur de texte de la bande", () => {
    const doc = allBlocks();
    doc.pages[0].sections[0].textColor = "accent";
    expect(render(doc)).toContain("color:var(--site-accent)");
  });
});

describe("pages automatiques", () => {
  const doc = siteDocumentSchema.parse({
    theme,
    pages: [
      { title: "Accueil", slug: "accueil", kind: "content", sections: [] },
      { title: "Menus", slug: "menus", kind: "menus" },
      { title: "Infos", slug: "infos", kind: "practical" },
    ],
  });

  it("Menus : plats, allergènes et épuisé, sans coordonnées", () => {
    const html = render(doc, "menus");
    expect(html).toContain("Poulet");
    expect(html).toContain("épuisé");
    expect(html).toContain("gluten");
    expect(html).toContain("Curry");
  });

  it("Infos pratiques : dates, lieu, règles ; aucun email, téléphone ni nom d'inscrit", () => {
    const html = render(doc, "infos");
    expect(html).toContain("Rennes");
    expect(html).toContain("Mineurs");
    expect(html).toContain("Wero");
    for (const page of ["menus", "infos"]) {
      const out = render(doc, page);
      expect(out).not.toContain("secret@example.org");
      expect(out).not.toContain("06 11 22 33 44");
      expect(out).not.toContain("Jeanne Dupont");
    }
  });
});

describe("événement terminé", () => {
  it("n'affiche que « Événement terminé », sans menu ni données", () => {
    const html = render(allBlocks(), undefined, null, true);
    expect(html).toContain("Événement terminé");
    expect(html).not.toContain("Pages du site");
  });
});

describe("page « Dress code » de la Nuit de la traversée", () => {
  const dressCode = {
    theme: { ...theme, colors: { primary: "#6b1d2a", secondary: "#4b5320", accent: "#c9a227", background: "#faf6ee", text: "#2b1a12" } },
    pages: [
      { title: "Accueil", slug: "accueil", kind: "content", sections: [] },
      {
        title: "Dress code", slug: "dress-code", kind: "content",
        sections: [
          { background: { kind: "color", color: "primary" }, textColor: "background", blocks: [{ kind: "banner", background: { kind: "gradient", stops: ["primary", "secondary"], direction: "diagonal" }, title: "Dress code", tagline: "Élégance et sobriété" }] },
          { background: { kind: "none" }, textColor: "text", blocks: [
            { kind: "palette", title: "Notre palette", swatches: [{ label: "Bordeaux", color: "#6b1d2a" }, { label: "Olive", color: "#4b5320" }, { label: "Or", color: "#c9a227" }, { label: "Crème", color: "#faf6ee" }] },
            { kind: "cards", cards: [
              { title: "Elle", icon: "gem", items: ["Robe longue", "Accessoires dorés"] },
              { title: "Lui", icon: "shirt", items: ["Costume sombre", "Cravate ou nœud papillon"] },
              { title: "Enfants", icon: "baby", items: ["Tenue de fête"] },
            ] },
            { kind: "gallery", title: "Inspirations", images: [{ assetId: A, alt: "Inspiration 1" }, { assetId: B, alt: "Inspiration 2" }] },
            { kind: "doDont", doTitle: "À faire", doItems: ["Respecter la palette"], dontTitle: "À éviter", dontItems: ["Le blanc", "Les jeans"] },
          ] },
        ],
      },
    ],
  };

  it("est un document valide, lisible, et se rend", () => {
    const doc = siteDocumentSchema.parse(dressCode);
    expect(contrastIssues(doc)).toEqual([]);
    const html = render(doc, "dress-code");
    for (const text of ["Notre palette", "Bordeaux", "Elle", "Inspirations", "À éviter"]) expect(html).toContain(text);
  });

  // Rétrocompatibilité : les évolutions du schéma ne changent ni le document analysé ni son rendu.
  it("document existant : analyse et rendu inchangés d'une évolution à l'autre", () => {
    const doc = siteDocumentSchema.parse(dressCode);
    expect(JSON.stringify(doc)).toMatchSnapshot("document");
    expect(render(doc, "dress-code")).toMatchSnapshot("rendu");
  });
});

describe("images : variantes et fonds", () => {
  const withBlocks = (blocks: unknown[], section: Record<string, unknown> = {}) =>
    siteDocumentSchema.parse({ theme, pages: [{ title: "Accueil", slug: "accueil", kind: "content", sections: [{ blocks, ...section }] }] });

  it("une image porte un srcset des trois variantes, en chargement différé", () => {
    const html = render(withBlocks([{ kind: "image", image: { assetId: A, alt: "Salle" } }]));
    expect(html).toContain(`/a/${A}?w=640 640w, /a/${A}?w=1280 1280w, /a/${A}?w=2400 2400w`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("sizes=");
  });

  it("logo et en-tête : srcset, jamais différés ; en-tête centré et recadré", () => {
    const doc = withBlocks([{ kind: "separator", style: "line" }]);
    doc.theme.logoAssetId = A;
    doc.theme.headerAssetId = B;
    const html = render(doc);
    const header = html.match(/<img[^>]*\/a\/b{25}[^>]*>/)![0];
    expect(header).toContain("object-cover object-center");
    expect(header).not.toContain("lazy");
    expect(html.match(/<img[^>]*\/a\/a{25}[^>]*>/)![0]).not.toContain("lazy");
  });

  it("fond image : <img> recadré (cover, centré) sous un voile, en chargement différé", () => {
    const html = render(withBlocks([{ kind: "separator", style: "line" }], { background: { kind: "image", assetId: A, veil: "background", opacity: 0.7, fixed: false } }));
    expect(html).toMatch(/<img[^>]*srcSet|<img[^>]*srcset/i);
    expect(html).toContain("size-full object-cover object-center");
    expect(html).toContain("opacity:0.7");
  });

  it("fond fixe : seulement à partir de 40 rem (défilant sur mobile)", () => {
    const html = render(withBlocks([{ kind: "separator", style: "line" }], { background: { kind: "image", assetId: A, veil: "background", opacity: 0.7, fixed: true } }));
    expect(html).toContain("bg-scroll @min-[40rem]:bg-fixed");
    expect(html).toContain("bg-cover bg-center");
  });

  it("hero avec fond : rendu sous voile, contraste vérifié sur ce fond", () => {
    const bg = { kind: "image", assetId: A, veil: "background", opacity: 0.8, fixed: false };
    const doc = withBlocks([{ kind: "hero", title: "Nuit", background: bg }]);
    expect(contrastIssues(doc)).toEqual([]);
    expect(render(doc)).toContain(`/a/${A}?w=1280`);
    const bad = withBlocks([{ kind: "hero", title: "Nuit", background: { kind: "color", color: "text" } }]);
    expect(contrastIssues(bad).some((i) => i.message.includes("bandeau"))).toBe(true);
  });

  it("l'image d'un fond de hero compte parmi les images du document", () => {
    const doc = withBlocks([{ kind: "hero", title: "Nuit", background: { kind: "image", assetId: A, veil: "background", opacity: 0.8, fixed: false } }]);
    expect([...assetIdsOf(doc)]).toEqual([A]);
    expect(assetUsagesOf(doc)[0].where).toBe("Accueil › bande 1 › bloc 1 (hero) › fond");
  });
});

describe("boutons, ancres et blocs enrichis", () => {
  const page = (blocks: unknown[], section: Record<string, unknown> = {}) =>
    siteDocumentSchema.parse({ theme, pages: [{ title: "Accueil", slug: "accueil", kind: "content", sections: [{ blocks, ...section }] }, { title: "Infos", slug: "infos", kind: "practical" }] });
  const btn = (target: unknown, style?: string) => ({ kind: "button", label: "Aller", target, ...(style ? { style } : {}) });

  it("lien externe : nouvel onglet, noopener noreferrer ; autres liens sans target", () => {
    const html = render(page([btn({ url: "https://exemple.org/x" }), btn({ mailto: "a@b.fr" }), btn({ tel: "+33 6 12 34 56 78" }), btn({ page: "infos" })]));
    expect(html).toMatch(/<a href="https:\/\/exemple.org\/x" target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain('href="mailto:a@b.fr"');
    expect(html).toContain('href="tel:+33612345678"');
    expect(html).toContain('href="/infos"');
    expect(html.match(/target="_blank"/g)).toHaveLength(1);
  });

  it("ancres : id sur la bande et sur le bloc, lien #ancre", () => {
    const html = render(page([{ kind: "hero", title: "T", anchor: "haut" }, btn({ anchor: "haut" })], { anchor: "bande" }));
    expect(html).toMatch(/<section id="bande"/);
    expect(html).toMatch(/<div id="haut"/);
    expect(html).toContain('href="#haut"');
  });

  it("styles : plein (défaut), contour, discret", () => {
    const html = render(page([btn({ booking: true }), btn({ booking: true }, "outline"), btn({ booking: true }, "subtle")]));
    expect(html).toContain("background-color:var(--site-primary)");
    expect(html).toContain("border:2px solid var(--site-primary)");
    expect(html).toContain("underline-offset-4");
  });

  it("bandeau : bouton personnalisé à la place de l'inscription ; sinon comportement actuel", () => {
    const custom = render(page([{ kind: "hero", title: "T", button: { label: "Programme", target: { url: "https://exemple.org/p" } } }]));
    expect(custom).toContain("Programme");
    expect(custom).not.toContain("inscris");
    const legacy = render(page([{ kind: "hero", title: "T", buttonLabel: "Je réserve" }]));
    expect(legacy).toContain("Je réserve");
    expect(legacy).toContain('href="/inscription/icc/nuit" class="inline-block rounded-full');
  });

  it("bannière : ligne secondaire et bouton", () => {
    const html = render(page([{ kind: "banner", background: { kind: "color", color: "primary" }, title: "T", secondary: "Ligne 2", button: { label: "Go", target: { mailto: "a@b.fr" } } }], { textColor: "background" }));
    expect(html).toContain("Ligne 2");
    expect(html).toContain('href="mailto:a@b.fr"');
  });

  it("cartes : titre, texte, colonnes ; pictogrammes : description ; questions : titre", () => {
    const html = render(page([
      { kind: "cards", title: "Tenues", columns: 3, cards: [{ title: "Elle", text: "Sobre", items: ["Robe"] }] },
      { kind: "icons", items: [{ icon: "star", label: "Parking", description: "Gratuit" }] },
      { kind: "faq", title: "Questions", items: [{ question: "Q", answer: "R" }] },
    ]));
    for (const text of ["Tenues", "Sobre", "grid-cols-3", "Gratuit", "Questions"]) expect(html).toContain(text);
    expect(render(page([{ kind: "cards", cards: [{ title: "A", items: ["x"] }] }]))).toContain("@min-[40rem]:grid-cols-2");
  });

  it("galerie ronde : vignettes arrondies ; grille par défaut", () => {
    const images = [{ assetId: A, alt: "Un" }, { assetId: B, alt: "Deux" }];
    expect(render(page([{ kind: "gallery", layout: "round", images }]))).toContain("rounded-full");
    const grid = render(page([{ kind: "gallery", images }]));
    expect(grid).not.toContain("rounded-full");
    expect(grid).toContain("aspect-square");
  });

  it("jamais de HTML saisi dans les libellés ni les textes", () => {
    const html = render(page([btn({ url: "https://exemple.org" }), { kind: "cards", cards: [{ title: RAW, text: RAW, items: [RAW] }] }, { kind: "icons", items: [{ icon: "star", label: RAW, description: RAW }] }]));
    expect(html).not.toContain("<b>x</b>");
  });
});
