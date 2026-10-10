import type { ButtonHTMLAttributes, ReactNode } from "react";

interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  /** Filtre actif. */
  readonly pressed: boolean;
  readonly children: ReactNode;
}

/**
 * Pastille de filtre bascule (spec 063, extraite spec 064) : bouton `aria-pressed` de 44 px de
 * haut. À regrouper dans un conteneur `role="group"` portant un `aria-label`.
 */
export default function FilterChip({ pressed, children, className = "", type = "button", ...props }: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-120
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          pressed ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
        } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
