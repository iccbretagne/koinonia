/**
 * Tests — description des schémas du site et erreurs explicites (spec 084) : la description est
 * générée depuis les schémas Zod, une clé refusée liste les clés permises, un `kind` inconnu liste
 * les `kind` permis.
 */
import { describe, it, expect } from "vitest";
import { SITE_ICONS, SITE_FONTS, GRADIENT_DIRECTIONS, PALETTE_KEYS, blockSchema, defaultSiteDocument, describeSite, describeSiteText, explainIssues, siteDocumentSchema } from "../schemas";

const byName = (subject: string) => describeSite(subject)[0];

describe("describeSite", () => {
  it("décrit chaque kind de bloc, le thème, la bande, la page et les fonds", () => {
    const subjects = describeSite().map((d) => d.subject);
    expect(subjects).toEqual(expect.arrayContaining(["hero", "richText", "image", "gallery", "palette", "cards", "doDont", "icons", "faq", "button", "banner", "separator", "theme", "band", "page", "background"]));
    for (const option of blockSchema.options) expect(subjects).toContain(option.shape.kind.value);
  });

  it("champs, obligatoire ou non, bornes et descriptions du bloc hero", () => {
    const f = Object.fromEntries(byName("hero").fields.map((x) => [x.path, x]));
    expect(f.title).toMatchObject({ required: true, limits: "1 à 120 caractères", type: "texte" });
    expect(f.tagline.required).toBe(false);
    expect(f.showCountdown).toMatchObject({ type: "booléen", required: false, default: false });
    expect(f.title.description).toBeTruthy();
    expect(Object.keys(f).filter((k) => !k.startsWith("background"))).toEqual(["kind", "title", "tagline", "showDateLocation", "showCountdown", "buttonLabel"]);
    expect(f.background.required).toBe(false);
  });

  it("valeurs permises issues des schémas : icônes, polices, palette, dégradés, séparateurs", () => {
    const icons = byName("icons").fields.find((f) => f.path === "items[].icon")!;
    expect(icons.values).toEqual([...SITE_ICONS]);
    const theme = byName("theme").fields;
    expect(theme.find((f) => f.path === "fonts.heading")!.values).toEqual([...SITE_FONTS]);
    expect(byName("band").fields.find((f) => f.path === "textColor")!.values).toEqual([...PALETTE_KEYS]);
    expect(byName("background").fields.some((f) => f.values?.join() === [...GRADIENT_DIRECTIONS].join())).toBe(true);
    expect(byName("separator").fields.find((f) => f.path === "style")!.values).toEqual(["line", "goldDiamond", "wave"]);
  });

  it("le texte est lisible et la cible du bouton liste ses formes", () => {
    const text = describeSiteText(describeSite("button"));
    expect(text).toContain("Bloc « button »");
    expect(text).toContain("target{page}.page");
    expect(text).toContain("target{booking=true}.booking");
  });
});

describe("explainIssues", () => {
  it("clé refusée : liste les clés permises de l'objet", () => {
    const input = { kind: "hero", title: "T", subtitle: "x" };
    const r = blockSchema.safeParse(input);
    expect(r.success).toBe(false);
    const msg = explainIssues(r.error!.issues, blockSchema, input, "bloc");
    expect(msg).toContain("`hero.subtitle` refusé : clés permises kind, title, tagline, showDateLocation, showCountdown, buttonLabel, background");
  });

  it("kind inconnu : liste les kind permis", () => {
    const input = { kind: "carrousel" };
    const msg = explainIssues(blockSchema.safeParse(input).error!.issues, blockSchema, input, "bloc");
    expect(msg).toContain("« carrousel » inconnu");
    expect(msg).toContain("hero, richText, image");
  });

  it("dans un document : chemin complet, clés de l'objet imbriqué", () => {
    const doc = defaultSiteDocument("T");
    (doc.pages[0].sections[0].blocks[0] as Record<string, unknown>).subtitle = "x";
    const r = siteDocumentSchema.safeParse(doc);
    const msg = explainIssues(r.error!.issues, siteDocumentSchema, doc);
    expect(msg).toContain("`pages.0.sections.0.blocks.0.subtitle` refusé : clés permises kind, title");
  });
});
