/**
 * Apparence des boutons, isolée de `Button.tsx` — qui porte `"use client"`, ce qui rendrait
 * `buttonClasses` inappelable depuis un composant serveur (« Attempted to call buttonClasses()
 * from the server but buttonClasses is on the client »). Ce module reste neutre : il est importable
 * des deux côtés.
 */

export type Variant = "primary" | "secondary" | "danger" | "ghost" | "info" | "edit";
export type Size = "sm" | "md";

export const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-1.5 md:px-2.5 md:py-1.5 min-h-[36px] text-xs",
  md: "px-3 py-2.5 md:px-4 md:py-2 min-h-[44px] text-sm",
};

export const variantClasses: Record<Variant, string> = {
  primary:
    "bg-icc-violet text-white hover:bg-icc-jaune hover:text-icc-violet focus:ring-icc-violet",
  secondary:
    "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-300",
  danger:
    "bg-icc-rouge text-white hover:bg-red-700 focus:ring-red-500",
  ghost:
    "bg-transparent text-icc-violet hover:bg-icc-violet-light focus:ring-icc-violet",
  info:
    "bg-icc-bleu text-white hover:bg-sky-600 focus:ring-icc-bleu",
  edit:
    "bg-icc-violet text-white hover:bg-icc-jaune hover:text-icc-violet focus:ring-icc-violet",
};

/** Classes du bouton, réutilisables sur un `<Link>`/`<a>` pour qu'un lien d'action ait l'apparence d'un bouton. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `inline-flex items-center justify-center gap-1.5 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${sizeClasses[size]} ${variantClasses[variant]}`;
}
