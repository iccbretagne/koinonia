import type { GivingNameSize } from "@/generated/prisma/enums";

/**
 * Classes du nom de l'église dans l'en-tête de la page de dons, par taille (spec 066). SMALL
 * reproduit le rendu d'origine. Toutes passent à la ligne pour éviter un défilement horizontal
 * sur un petit téléphone.
 */
export const CHURCH_NAME_CLASSES: Readonly<Record<GivingNameSize, string>> = {
  SMALL: "text-xs font-semibold uppercase tracking-widest text-on-brand/70 break-words",
  MEDIUM: "text-base font-semibold uppercase leading-6 tracking-wider text-on-brand/80 break-words",
  LARGE: "font-display text-[22px] font-bold uppercase leading-7 tracking-wide text-on-brand break-words",
};
