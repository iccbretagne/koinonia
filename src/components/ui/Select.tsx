"use client";

import { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { FieldLabel, FieldMessage, useFieldIds } from "./Field";
import { controlClasses } from "./field-classes";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Libellé visible. Une chaîne vide masque le libellé (filtre de liste) : le `placeholder` sert
   * alors de nom accessible, à défaut d'un `aria-label` explicite.
   */
  readonly label: string;
  readonly options: { value: string; label: string }[];
  readonly error?: string;
  readonly placeholder?: string;
  /** Aide affichée sous le champ (remplacée par l'erreur quand il y en a une). */
  readonly hint?: ReactNode;
}

/** Liste déroulante native avec libellé, aide et erreur (docs/design-system/components/Field.md). */
export default function Select({
  label,
  options,
  error,
  hint,
  placeholder,
  id,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  ...props
}: Readonly<SelectProps>) {
  const { controlId, messageId, ariaDescribedBy } = useFieldIds({ id, hint, error, describedBy });
  const multiple = Boolean(props.multiple);

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={controlId}>{label}</FieldLabel>}
      <div className="relative">
        <select
          id={controlId}
          aria-label={ariaLabel ?? (label ? undefined : placeholder)}
          aria-invalid={error ? true : ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={`${controlClasses(Boolean(error))} ${multiple ? "" : "appearance-none pr-10 cursor-pointer"} ${className}`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {!multiple && (
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.75}
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
          />
        )}
      </div>
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}
