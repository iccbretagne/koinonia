import { z } from "zod";

/**
 * Icône de l'application (spec 069) : variantes servies et règles de saisie. Module pur, partagé
 * par le service, les contrats et l'écran d'administration.
 */

/** Variantes produites à partir de l'icône déposée. */
export const APP_ICON_IMAGE_VARIANTS = [
  "icon-192",
  "icon-512",
  "icon-maskable-512",
  "apple-touch-180",
  "favicon-48",
] as const;

/** Silhouette des notifications Android, déposée à part. */
export const APP_ICON_BADGE_VARIANT = "badge-96";

export const APP_ICON_VARIANTS = [...APP_ICON_IMAGE_VARIANTS, APP_ICON_BADGE_VARIANT] as const;

export type AppIconImageVariant = (typeof APP_ICON_IMAGE_VARIANTS)[number];
export type AppIconVariantName = (typeof APP_ICON_VARIANTS)[number];

export function isAppIconVariant(value: string): value is AppIconVariantName {
  return (APP_ICON_VARIANTS as readonly string[]).includes(value);
}

/** Icônes livrées avec Koinonia, servies tant qu'aucune icône n'est déposée. */
export const DEFAULT_APP_ICON_PATHS: Record<AppIconVariantName, string> = {
  "icon-192": "/brand/koinonia-icon-192.png",
  "icon-512": "/brand/koinonia-icon-512.png",
  "icon-maskable-512": "/brand/koinonia-icon-maskable-512.png",
  "apple-touch-180": "/brand/apple-touch-icon-180.png",
  "favicon-48": "/brand/favicon-48.png",
  "badge-96": "/brand/koinonia-badge-96.png",
};

/** Badge générique, sous une icône déposée sans silhouette. */
export const GENERIC_BADGE_PATH = "/brand/badge-bell-96.png";

/** Poids maximal d'un fichier déposé (icône ou silhouette). */
export const APP_ICON_MAX_BYTES = 5 * 1024 * 1024;
/** Côté minimal de l'icône déposée. */
export const APP_ICON_MIN_SIZE = 512;

export const appIconBackgroundSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur de fond attendue au format #rrggbb")
  .transform((value) => value.toLowerCase());

export const appIconDeleteSchema = z.object({ target: z.enum(["icon", "badge"]) });

/* ── Logo de l'église dans l'interface (spec 072) ─────────────────────────── */

/** `light` : logo principal, fond clair ; `dark` : facultatif, thème sombre. */
export const CHURCH_LOGO_VARIANTS = ["light", "dark"] as const;
export type ChurchLogoVariant = (typeof CHURCH_LOGO_VARIANTS)[number];
export const churchLogoVariantSchema = z.enum(CHURCH_LOGO_VARIANTS);

export const CHURCH_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const CHURCH_LOGO_LABEL: Record<ChurchLogoVariant, string> = {
  light: "fond clair",
  dark: "fond sombre",
};

/** Adresses du logo affiché dans la coquille ; `dark` retombe sur `light`. */
export interface ChurchLogoSources {
  light: string;
  dark: string;
}

export function churchLogoSrc(churchId: string, variant: ChurchLogoVariant, version: string): string {
  return `/api/churches/${encodeURIComponent(churchId)}/logo?variant=${variant}&v=${version}`;
}

/** `null` sans logo pour fond clair : les plumes ICC s'affichent, même avec un logo sombre seul. */
export function churchLogoSources(
  churchId: string,
  logos: readonly { variant: string; version: string }[]
): ChurchLogoSources | null {
  const light = logos.find((l) => l.variant === "light");
  if (!light) return null;
  const dark = logos.find((l) => l.variant === "dark");
  const lightSrc = churchLogoSrc(churchId, "light", light.version);
  return { light: lightSrc, dark: dark ? churchLogoSrc(churchId, "dark", dark.version) : lightSrc };
}
