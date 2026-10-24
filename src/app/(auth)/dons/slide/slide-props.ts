import type { GivingNameSize } from "@/generated/prisma/enums";
import type { GivingPageContent } from "@/modules/giving/schemas";

/** Contenu de la scène de la slide, hors QR code (calculé à partir de `target`). */
export interface SlideProps {
  readonly churchName: string;
  /** Taille du nom de l'église, `null` s'il est masqué (spec 066). */
  readonly churchNameSize: GivingNameSize | null;
  /** Logo (même origine), `null` s'il est absent ou masqué. */
  readonly logoSrc: string | null;
  /** Adresse visée par le QR code : l'adresse courte, à défaut la page publique Koinonia. */
  readonly target: string;
  /** Adresse courte, seule écrite sous le QR code. */
  readonly shortUrl: string | null;
  readonly transfer: boolean;
  readonly onsite: boolean;
  readonly checkPayee: string | null;
  readonly verse: { readonly text: string; readonly reference: string | null } | null;
}

/**
 * Seule traduction du contenu vers la slide (spec 067) : la slide projetée (contenu enregistré)
 * et l'aperçu du paramétrage (brouillon) passent tous deux par ici, pour rester identiques.
 */
export function toSlideProps(
  content: GivingPageContent,
  ctx: { readonly churchName: string; readonly publicUrl: string; readonly logoSrc: string | null }
): SlideProps {
  return {
    churchName: ctx.churchName,
    churchNameSize: content.slideChurchNameShown ? content.slideChurchNameSize : null,
    logoSrc: content.slideLogoShown ? ctx.logoSrc : null,
    target: content.shortUrl ?? ctx.publicUrl,
    shortUrl: content.shortUrl,
    transfer: content.transferEnabled,
    onsite: content.onsiteEnabled,
    checkPayee: content.onsiteEnabled ? content.checkPayee : null,
    verse: content.verseText ? { text: content.verseText, reference: content.verseReference } : null,
  };
}
