/**
 * Apparence des boutons, isolée de `Button.tsx` — qui porte `"use client"`, ce qui rendrait
 * `buttonClasses` inappelable depuis un composant serveur (« Attempted to call buttonClasses()
 * from the server but buttonClasses is on the client »). Ce module reste neutre : il est importable
 * des deux côtés.
 *
 * Spec 055 (docs/design-system/components/Button.md) : quatre variantes sur les tokens
 * sémantiques. `edit` (identique à primary) et `info` (bleu clair sur blanc, 2.2:1) restent
 * acceptées pour ne pas casser les écrans existants, mais rendent respectivement `primary` et
 * `secondary`.
 */

export type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "on-brand"
  | "on-brand-secondary"
  | "info"
  | "edit";
export type Size = "sm" | "md";

/**
 * `md` = 44px (cible tactile minimale) ; `sm` = 44px sous 640px puis 36px (actions de ligne d'un
 * tableau desktop) : la cible tactile mobile est intégrée à la taille, pas ajoutée appel par appel.
 */
export const sizeClasses: Record<Size, string> = {
  sm: "min-h-11 sm:min-h-9 px-3 py-1.5 text-[13px] leading-[18px]",
  md: "min-h-11 px-4 py-2 text-sm leading-5",
};

const primary = "border-transparent bg-brand text-on-brand hover:bg-brand-hover";
const secondary = "border-control-line bg-surface text-ink hover:bg-surface-sunken";

export const variantClasses: Record<Variant, string> = {
  primary,
  secondary,
  ghost: "border-transparent bg-transparent text-brand-text hover:bg-brand-soft",
  danger: "border-transparent bg-danger text-on-danger hover:bg-danger/90",
  /** Sur un aplat `brand` (carte « Prochain service ») : action principale, fond `surface`. */
  "on-brand": "border-transparent bg-surface text-brand-text hover:bg-brand-soft",
  /** Sur un aplat `brand` : action d'appoint, contour `on-brand`. */
  "on-brand-secondary": "border-on-brand/50 bg-transparent text-on-brand hover:bg-on-brand/10",
  /** @deprecated Variante retirée du design system : rendu `secondary`. */
  info: secondary,
  /** @deprecated Identique à `primary`. */
  edit: primary,
};

/**
 * Forme commune à toutes les variantes : typographie, états appui/désactivé, anneau de focus
 * sans sa couleur. Les couleurs (bordure, anneau) appartiennent à chaque variante : deux
 * utilitaires de même propriété sur un même élément se départagent par l'ordre de la feuille
 * générée, pas par celui de la chaîne.
 */
const buttonShapeClasses =
  "inline-flex items-center justify-center gap-2 text-center font-display font-semibold tracking-[0.005em] " +
  "rounded-control border cursor-pointer select-none " +
  "transition-[background-color,border-color,color,transform] duration-120 ease-out active:scale-[0.98] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "aria-disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 " +
  "motion-reduce:active:scale-100";

/** Socle d'un bouton posé sur `bg`/`surface` (anneau de focus `focus`), pour composer une variante locale. */
export const buttonBaseClasses = `${buttonShapeClasses} focus-visible:outline-focus`;

/** Sur un aplat `brand`, l'anneau `focus` (violet) disparaît : il prend `on-brand`. */
function focusRing(variant: Variant): string {
  return variant === "on-brand" || variant === "on-brand-secondary"
    ? "focus-visible:outline-on-brand"
    : "focus-visible:outline-focus";
}

/** Classes du bouton, réutilisables sur un `<Link>`/`<a>` pour qu'un lien d'action ait l'apparence d'un bouton. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `${buttonShapeClasses} ${focusRing(variant)} ${sizeClasses[size]} ${variantClasses[variant]}`;
}

export type IconButtonVariant = "default" | "on-dark";

const iconButtonVariantClasses: Record<IconButtonVariant, string> = {
  default: "text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-focus",
  /**
   * Visionneuses plein écran toujours sombres (lightbox, galeries par lien), quel que soit le
   * thème : blanc translucide, sans token clair/sombre qui suivrait le thème de l'utilisateur.
   */
  // eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre (fond noir fixe)
  "on-dark": "text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-white",
};

/**
 * Apparence de `IconButton` (carré à une icône), réutilisable sur un `<a>` (téléchargement) qui
 * doit avoir l'apparence du bouton sans en être un. `md` = 44px, `sm` = 44px sous 640px puis
 * 36px (densité desktop). `on-dark` : sur le fond noir d'une visionneuse.
 */
export function iconButtonClasses(size: Size = "md", variant: IconButtonVariant = "default"): string {
  return (
    "relative inline-grid shrink-0 cursor-pointer place-items-center rounded-control " +
    "transition-[background-color,color,transform] duration-120 active:scale-[0.96] " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent motion-reduce:active:scale-100 " +
    `${iconButtonVariantClasses[variant]} ` +
    (size === "sm" ? "size-11 sm:size-9" : "size-11")
  );
}
