"use client";

import { useId, type ReactNode } from "react";
import { FieldMessage } from "./Field";
import { fieldLabelClasses } from "./field-classes";

export interface RadioOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  /** Précision sous le libellé (variante `list` seulement). */
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

interface RadioGroupProps<T extends string> {
  /** Question posée (« Type d'ajout ») : `<legend>` du groupe. */
  readonly legend: ReactNode;
  /** Masque la légende à l'écran (elle reste lue) : un titre voisin pose déjà la question. */
  readonly hideLegend?: boolean;
  /** Nom du champ (formulaire natif) ; un identifiant stable est généré à défaut. */
  readonly name?: string;
  readonly options: readonly RadioOption<T>[];
  /** Valeur contrôlée ; à défaut, `defaultValue` (formulaire envoyé tel quel). */
  readonly value?: T | "";
  readonly defaultValue?: T;
  readonly onChange?: (value: T) => void;
  /**
   * `list` (défaut) : un rond par ligne de 44 px, pour des choix à lire ;
   * `chips` : pastilles de choix sur une ligne qui passe à la ligne, pour des choix courts.
   */
  readonly variant?: "list" | "chips";
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly className?: string;
}

/**
 * Pastille de choix (radio ou case masquée dans un `<label>`) : 44 px, coins `radius-full`,
 * active en `brand-soft`/`brand-text`, focus visible porté par l'étiquette.
 */
export function choiceChipClasses(on: boolean): string {
  return `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-120
    has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus
    has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 ${
      on ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
    }`;
}

/** Rond de choix natif aux couleurs du design system (20 px, coché en `brand`). */
export const radioInputClasses =
  "mt-0.5 size-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed";

/**
 * Choix unique dans un formulaire (docs/design-system/components/RadioGroup.md) : `<fieldset>` +
 * `<legend>` et radios natifs (flèches du clavier, envoi du formulaire). Pour changer la vue d'une
 * page, préférer `SegmentedControl`.
 */
export default function RadioGroup<T extends string>({
  legend,
  hideLegend = false,
  name,
  options,
  value,
  defaultValue,
  onChange,
  variant = "list",
  required,
  disabled = false,
  hint,
  error,
  className = "",
}: Readonly<RadioGroupProps<T>>) {
  const generated = useId();
  const groupName = name ?? generated;
  const messageId = `${generated}-message`;
  const controlled = value !== undefined;

  return (
    <fieldset
      className={`min-w-0 ${className}`}
      disabled={disabled}
      aria-describedby={hint || error ? messageId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={hideLegend ? "sr-only" : `${fieldLabelClasses} mb-2`}>{legend}</legend>
      <div className={variant === "chips" ? "flex flex-wrap gap-2" : "flex flex-col"}>
        {options.map((opt) => {
          const checkedProps = controlled
            ? { checked: value === opt.value, onChange: () => onChange?.(opt.value) }
            : { defaultChecked: defaultValue === opt.value, onChange: () => onChange?.(opt.value) };
          if (variant === "chips") {
            const on = controlled ? value === opt.value : false;
            return (
              <label key={opt.value} className={choiceChipClasses(on)}>
                <input
                  type="radio"
                  name={groupName}
                  value={opt.value}
                  required={required}
                  disabled={opt.disabled}
                  className="sr-only"
                  {...checkedProps}
                />
                {opt.label}
              </label>
            );
          }
          return (
            <label
              key={opt.value}
              className={`flex min-h-11 items-start gap-3 py-2.5 text-[15px] leading-[22px] text-ink ${
                opt.disabled || disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                required={required}
                disabled={opt.disabled}
                className={radioInputClasses}
                {...checkedProps}
              />
              <span className="flex min-w-0 flex-col">
                <span>{opt.label}</span>
                {opt.description && <span className="text-[13px] leading-[18px] text-ink-muted">{opt.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldMessage id={messageId} hint={hint} error={error} />
    </fieldset>
  );
}
