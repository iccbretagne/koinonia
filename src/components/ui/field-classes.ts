/**
 * Apparence partagée des champs de formulaire (docs/design-system/components/Field.md), neutre
 * (ni client ni serveur) pour être réutilisable sur un `<input>` natif hors des composants.
 *
 * Texte saisi en 16px à toutes les largeurs : en dessous, Safari iOS zoome la page au focus.
 * Bordure `control-line` (3.6:1) — `line` ne délimite pas assez un contrôle.
 */

export const fieldLabelClasses =
  "block font-display text-[13px] leading-[18px] font-semibold text-ink";

export const fieldHintClasses = "text-[13px] leading-[18px] text-ink-muted";

export const fieldErrorClasses = "flex items-start gap-1 text-[13px] leading-[18px] text-danger";

const controlBase =
  "block w-full min-w-0 bg-surface text-ink text-base leading-6 font-sans " +
  "border rounded-control px-3 " +
  "transition-[border-color,box-shadow] duration-120 " +
  "focus:outline-none focus-visible:outline-none focus:ring-1 " +
  "disabled:opacity-45 disabled:cursor-not-allowed disabled:bg-surface-sunken";

const controlState = {
  normal: "border-control-line hover:border-ink-muted focus:border-focus focus:ring-focus",
  error: "border-danger ring-1 ring-danger focus:border-danger focus:ring-danger",
};

/** Classes d'un `<input>`/`<select>` (44px de haut). */
export function controlClasses(hasError = false): string {
  return `${controlBase} min-h-11 py-2.5 ${hasError ? controlState.error : controlState.normal}`;
}

/** Classes d'un `<textarea>` (hauteur fixée par `rows`). */
export function textareaClasses(hasError = false): string {
  return `${controlBase} py-2.5 resize-y ${hasError ? controlState.error : controlState.normal}`;
}
