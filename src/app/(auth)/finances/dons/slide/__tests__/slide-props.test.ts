import { describe, it, expect } from "vitest";
import { toSlideProps } from "../slide-props";
import { content } from "../../__tests__/fixtures";

const ctx = { churchName: "ICC Rennes", publicUrl: "https://koinonia.test/donner/rennes", logoSrc: "/logo.png" };

describe("traduction contenu → slide (spec 067)", () => {
  it("reprend nom, logo, moyens de don et verset", () => {
    expect(toSlideProps(content, ctx)).toEqual({
      churchName: "ICC Rennes",
      churchNameSize: "LARGE",
      logoSrc: "/logo.png",
      target: ctx.publicUrl,
      shortUrl: null,
      transfer: true,
      onsite: true,
      checkPayee: "ICC Rennes",
      verse: { text: content.verseText, reference: content.verseReference },
    });
  });

  it("nom masqué : pas de taille", () => {
    expect(toSlideProps({ ...content, slideChurchNameShown: false }, ctx).churchNameSize).toBeNull();
  });

  it("logo seulement s'il est affiché et déposé", () => {
    expect(toSlideProps({ ...content, slideLogoShown: false }, ctx).logoSrc).toBeNull();
    expect(toSlideProps(content, { ...ctx, logoSrc: null }).logoSrc).toBeNull();
  });

  it("le QR code vise l'adresse courte quand elle existe", () => {
    const props = toSlideProps({ ...content, shortUrl: "https://icc.fr/don" }, ctx);
    expect(props.target).toBe("https://icc.fr/don");
    expect(props.shortUrl).toBe("https://icc.fr/don");
  });

  it("ordre des chèques seulement si « sur place » est activé", () => {
    expect(toSlideProps({ ...content, onsiteEnabled: false }, ctx).checkPayee).toBeNull();
  });

  it("verset vide : absent", () => {
    expect(toSlideProps({ ...content, verseText: null }, ctx).verse).toBeNull();
  });

  it("ne dépend pas des réglages de la page publique", () => {
    expect(toSlideProps({ ...content, pageLogoShown: false, pageChurchNameShown: false }, ctx)).toEqual(toSlideProps(content, ctx));
  });
});
