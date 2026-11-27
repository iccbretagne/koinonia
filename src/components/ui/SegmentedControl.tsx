"use client";

import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** Ce que le contrôle règle (« Affichage », « Période ») : nom du groupe pour les lecteurs d'écran. */
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (value: T) => void;
  /** `md` = 44 px ; `sm` = 44 px sur mobile puis 36 px (barre d'outils desktop). */
  readonly size?: "sm" | "md";
  /** Segments de largeur égale sur toute la ligne (choix dans un formulaire). */
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Classes d'un segment, actif ou non (réutilisables pour un segment qui serait un lien). */
export function segmentClasses(active: boolean, size: "sm" | "md" = "md"): string {
  return `${size === "sm" ? "min-h-11 sm:min-h-9" : "min-h-11"} rounded-[7px] px-4 font-display text-sm font-semibold
    transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus
    disabled:cursor-not-allowed disabled:opacity-45 ${
      active ? "bg-surface text-brand-text shadow-card" : "cursor-pointer text-ink-muted hover:text-ink"
    }`;
}

/**
 * Contrôle segmenté (docs/design-system/components/SegmentedControl.md) : deux à cinq options
 * exclusives qui changent la vue de la page (Tableau / Frise, Semaine / Mois / Liste). Boutons
 * `aria-pressed` dans un `role="group"` nommé : chaque segment est atteint par Tab. Pour un champ
 * de formulaire, préférer `RadioGroup` ; pour des panneaux de contenu, `Tabs`.
 */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  fullWidth = false,
  disabled = false,
  className = "",
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${fullWidth ? "grid w-full" : "inline-flex w-fit"} min-w-0 gap-0.5 rounded-control bg-surface-sunken p-[3px] ${className}`}
      style={fullWidth ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={segmentClasses(value === o.value, size)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
