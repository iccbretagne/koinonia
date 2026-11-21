import { PALETTE_LABEL, backgroundsOf, type PaletteKey, type SiteBackground, type SiteDocument } from "./site-schemas";

/**
 * Lisibilité des sites d'événement (spec 084) : ratio de contraste WCAG 2.1 du texte sur chaque
 * fond, au **point le moins favorable** — chaque couleur d'un dégradé, le voile d'une image mélangé
 * au noir et au blanc (l'image dessous est inconnue). Seuil 4,5:1 (texte courant).
 */

export const MIN_CONTRAST = 4.5;

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Luminance relative (WCAG 2.1). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Couleur d'un voile d'opacité `alpha` posé sur `under`. */
const blend = (veil: Rgb, alpha: number, under: Rgb): Rgb => veil.map((c, i) => Math.round(alpha * c + (1 - alpha) * under[i])) as Rgb;

/** Couleurs effectives qu'un texte peut avoir dessous, sur ce fond. */
export function surfaceColors(background: SiteBackground, colors: Record<PaletteKey, string>): Rgb[] {
  switch (background.kind) {
    case "none":
      return [hexToRgb(colors.background)];
    case "color":
      return [hexToRgb(colors[background.color])];
    case "gradient":
      return background.stops.map((k) => hexToRgb(colors[k]));
    case "image": {
      const veil = hexToRgb(colors[background.veil]);
      return [blend(veil, background.opacity, [0, 0, 0]), blend(veil, background.opacity, [255, 255, 255])];
    }
  }
}

export interface ContrastIssue {
  where: string;
  ratio: number;
  message: string;
}

/** Ratio le plus faible du texte `text` sur ce fond. */
export function worstContrast(background: SiteBackground, text: PaletteKey, colors: Record<PaletteKey, string>): number {
  const ink = hexToRgb(colors[text]);
  return Math.min(...surfaceColors(background, colors).map((c) => contrastRatio(ink, c)));
}

/** Combinaisons illisibles du document, avec une piste pour chacune. */
export function contrastIssues(doc: SiteDocument): ContrastIssue[] {
  const { colors } = doc.theme;
  return backgroundsOf(doc).flatMap(({ where, background, text }) => {
    const ratio = worstContrast(background, text, colors);
    if (ratio >= MIN_CONTRAST) return [];
    const hint =
      background.kind === "image"
        ? "rendez le voile plus opaque, ou changez la couleur du voile ou du texte"
        : background.kind === "gradient"
          ? "choisissez des couleurs de dégradé plus proches entre elles, ou une autre couleur de texte"
          : "choisissez une autre couleur de fond ou de texte";
    return [
      {
        where,
        ratio: Math.round(ratio * 100) / 100,
        message: `${where} : texte « ${PALETTE_LABEL[text]} » peu lisible (contraste ${ratio.toFixed(1)}:1, ${MIN_CONTRAST}:1 au moins) — ${hint}.`,
      },
    ];
  });
}
