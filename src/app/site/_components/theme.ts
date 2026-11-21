import type { CSSProperties } from "react";
import { contrastRatio, hexToRgb } from "@/modules/ticketing/schemas";
import type { PaletteKey, SiteBackground, SiteTheme } from "@/modules/ticketing/schemas";
import { fontFamily } from "./fonts";

/**
 * Traduction du thème en CSS (spec 084). Les seules valeurs saisies sont les cinq hexadécimaux
 * validés du thème, posés en variables CSS ; les fonds ne sont que des choix d'énumération
 * traduits ici, jamais une chaîne CSS libre.
 */

export const colorVar = (key: PaletteKey) => `var(--site-${key})`;

/** Noir ou blanc, le plus lisible sur cette couleur (texte des boutons). */
function readableOn(hex: string): string {
  const color = hexToRgb(hex);
  return contrastRatio(color, hexToRgb("#000000")) >= contrastRatio(color, hexToRgb("#ffffff")) ? "#000000" : "#ffffff";
}

export function themeStyle(theme: SiteTheme): CSSProperties {
  const { colors, fonts } = theme;
  return {
    "--site-primary": colors.primary,
    "--site-secondary": colors.secondary,
    "--site-accent": colors.accent,
    "--site-background": colors.background,
    "--site-text": colors.text,
    "--site-on-primary": readableOn(colors.primary),
    "--site-font-heading": fontFamily(fonts.heading),
    "--site-font-body": fontFamily(fonts.body),
    backgroundColor: colorVar("background"),
    color: colorVar("text"),
    fontFamily: "var(--site-font-body)",
  } as CSSProperties;
}

const GRADIENT_ANGLE = { vertical: "linear-gradient(180deg,", horizontal: "linear-gradient(90deg,", diagonal: "linear-gradient(135deg,", radial: "radial-gradient(circle," } as const;

export type AssetUrl = (id: string, width?: number) => string;

/** Largeurs des variantes générées (`VARIANT_WIDTHS` côté service) : `w` absente ou inconnue ⇒ variante la plus proche. */
export const SRC_WIDTHS = [640, 1280, 2400] as const;
export const srcSetOf = (assetUrl: AssetUrl, id: string) => SRC_WIDTHS.map((w) => `${assetUrl(id, w)} ${w}w`).join(", ");

export interface BackdropLayer {
  key: string;
  style?: CSSProperties;
  className?: string;
  /** Image de fond affichée par un `<img>` (srcset, lazy, `object-fit: cover`, centrée). */
  imageId?: string;
}

/**
 * Calques de fond (couleur, dégradé, image + voile) à poser dans un conteneur `relative`. Une image
 * fixe au défilement reste en CSS, mais seulement à partir de 40 rem de large : le rendu est
 * mauvais sur mobile, où elle défile avec la page.
 */
export function backdropLayers(background: SiteBackground, assetUrl: AssetUrl): BackdropLayer[] {
  switch (background.kind) {
    case "none":
      return [];
    case "color":
      return [{ key: "color", style: { backgroundColor: colorVar(background.color) } }];
    case "gradient":
      return [{ key: "gradient", style: { backgroundImage: `${GRADIENT_ANGLE[background.direction]} ${background.stops.map(colorVar).join(", ")})` } }];
    case "image": {
      const image: BackdropLayer = background.fixed
        ? { key: "image", style: { backgroundImage: `url("${assetUrl(background.assetId, 2400)}")` }, className: "bg-cover bg-center bg-scroll @min-[40rem]:bg-fixed" }
        : { key: "image", imageId: background.assetId };
      return [image, { key: "veil", style: { backgroundColor: colorVar(background.veil), opacity: background.opacity } }];
    }
  }
}

/** Page d'inscription habillée par le thème : seuls les jetons « marque » changent, pas les surfaces ni les règles. */
export function registrationThemeStyle(theme: SiteTheme): CSSProperties {
  return {
    "--brand": colorVar("primary"),
    "--brand-hover": colorVar("primary"),
    "--brand-text": colorVar("primary"),
    "--brand-soft": "color-mix(in srgb, var(--site-primary) 12%, white)",
    "--on-brand": "var(--site-on-primary)",
    "--site-primary": theme.colors.primary,
    "--site-on-primary": readableOn(theme.colors.primary),
    fontFamily: "var(--site-font-body)",
    "--site-font-body": fontFamily(theme.fonts.body),
  } as CSSProperties;
}
