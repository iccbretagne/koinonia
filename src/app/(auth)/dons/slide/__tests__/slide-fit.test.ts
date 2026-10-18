import { describe, it, expect } from "vitest";
import { displayUrl, fitQrSize, fitUrlLines, fitVerse, slideVerse } from "../slide-fit";

/** Mesure simulée : largeur ≈ caractères × taille × 0,6, dans un cadre de 628 px. */
const fitsIn = (width: number) => (lines: string[], size: number) =>
  lines.every((line) => line.length * size * 0.6 <= width);

describe("ajustements de la slide (spec 065)", () => {
  it("affiche l'adresse sans protocole ni barre finale", () => {
    expect(displayUrl("https://icc.fr/don/")).toBe("icc.fr/don");
  });

  it("garde une adresse courte sur une ligne à 60 px", () => {
    expect(fitUrlLines("icc.fr/don", fitsIn(628))).toEqual({ lines: ["icc.fr/don"], size: 60 });
  });

  it("réduit la police avant de couper", () => {
    const result = fitUrlLines("iccbretagne.fr/donner", fitsIn(628));
    expect(result.lines).toHaveLength(1);
    expect(result.size).toBeLessThan(60);
    expect(result.size).toBeGreaterThanOrEqual(44);
  });

  it("passe sur deux lignes, domaine puis chemin, quand une ligne ne tient plus à 44 px", () => {
    const result = fitUrlLines("impactcentrechretien-rennes.fr/donner", fitsIn(628));
    expect(result.lines).toEqual(["impactcentrechretien-rennes.fr", "/donner"]);
    expect(result.size).toBeGreaterThanOrEqual(34);
  });

  it("dernier recours : une ligne à 34 px", () => {
    expect(fitUrlLines("x".repeat(80), fitsIn(628))).toEqual({ lines: ["x".repeat(80)], size: 34 });
  });

  it("verset : police réduite jusqu'à 24 px, puis retour à la ligne", () => {
    expect(fitVerse((size) => size <= 30)).toEqual({ size: 30, wrap: false });
    expect(fitVerse(() => false)).toEqual({ size: 24, wrap: true });
  });

  it("ne reprend que la première proposition du verset", () => {
    expect(slideVerse("Que chacun donne, non à regret ni par contrainte ; car Dieu aime")).toBe(
      "Que chacun donne, non à regret ni par contrainte"
    );
  });

  it("QR code : 470 px s'il tient, réduit par pas de 10, jamais sous 300", () => {
    expect(fitQrSize(() => false)).toBe(470);
    expect(fitQrSize((size) => size > 420)).toBe(420);
    expect(fitQrSize(() => true)).toBe(300);
  });
});
