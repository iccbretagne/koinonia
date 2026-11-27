"use client";

import { useId, type ReactNode } from "react";

interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** Ce que l'interrupteur active (« Publier la page »). Toujours fourni : c'est son nom accessible. */
  readonly label: string;
  /**
   * Masque le libellé à l'écran (`aria-label` seul) quand une ligne de réglage le porte déjà à
   * côté. Défaut : libellé visible à gauche, toute la ligne cliquable.
   */
  readonly hideLabel?: boolean;
  /** Précision sous le libellé visible (ignorée avec `hideLabel`). */
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

/** Piste et pastille, partagées par les deux présentations. */
function Track({ checked }: { readonly checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-120 ${
        checked ? "bg-brand" : "bg-control-line"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-surface shadow-card transition-transform duration-120 motion-reduce:transition-none ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </span>
  );
}

/**
 * Interrupteur marche/arrêt (docs/design-system/components/Switch.md) : `role="switch"` +
 * `aria-checked`, piste de 24 px dans une zone tactile de 44 px, effet immédiat ou au bouton
 * « Enregistrer » selon l'écran (à dire dans la description). Pour un choix à enregistrer dans
 * un formulaire classique, préférer `Checkbox`.
 */
export default function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  description,
  disabled = false,
  id,
  className = "",
}: Readonly<SwitchProps>) {
  const generated = useId();
  const switchId = id ?? generated;
  const descriptionId = `${switchId}-description`;

  const button = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      aria-describedby={!hideLabel && description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-control
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
        disabled:cursor-not-allowed disabled:opacity-45 ${hideLabel ? className : ""}`}
    >
      <Track checked={checked} />
    </button>
  );

  if (hideLabel) return button;

  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 flex-col">
        <label htmlFor={switchId} className={`text-[15px] leading-[22px] text-ink ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="text-[13px] leading-[18px] text-ink-muted">
            {description}
          </span>
        )}
      </div>
      {button}
    </div>
  );
}
