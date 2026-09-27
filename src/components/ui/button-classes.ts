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

export type Variant = "primary" | "secondary" | "danger" | "ghost" | "info" | "edit";
export type Size = "sm" | "md";

/** `md` = 44px (cible tactile minimale), `sm` = 36px (actions de ligne d'un tableau desktop). */
export const sizeClasses: Record<Size, string> = {
  sm: "min-h-9 px-3 py-1.5 text-[13px] leading-[18px]",
  md: "min-h-11 px-4 py-2 text-sm leading-5",
};

const primary = "border-transparent bg-brand text-on-brand hover:bg-brand-hover";
const secondary = "border-control-line bg-surface text-ink hover:bg-surface-sunken";

export const variantClasses: Record<Variant, string> = {
  primary,
  secondary,
  ghost: "border-transparent bg-transparent text-brand-text hover:bg-brand-soft",
  danger: "border-transparent bg-danger text-on-danger hover:bg-danger/90",
  /** @deprecated Variante retirée du design system : rendu `secondary`. */
  info: secondary,
  /** @deprecated Identique à `primary`. */
  edit: primary,
};

/**
 * Socle commun à toutes les variantes : forme, typographie, états focus/appui/désactivé. La
 * couleur de bordure appartient à chaque variante (deux utilitaires de couleur de bordure sur un
 * même élément se départagent par l'ordre de la feuille générée, pas par celui de la chaîne).
 */
export const buttonBaseClasses =
  "inline-flex items-center justify-center gap-2 text-center font-display font-semibold tracking-[0.005em] " +
  "rounded-control border cursor-pointer select-none " +
  "transition-[background-color,border-color,color,transform] duration-120 ease-out active:scale-[0.98] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "aria-disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 " +
  "motion-reduce:active:scale-100";

/** Classes du bouton, réutilisables sur un `<Link>`/`<a>` pour qu'un lien d'action ait l'apparence d'un bouton. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `${buttonBaseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`;
}
