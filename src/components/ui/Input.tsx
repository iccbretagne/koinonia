"use client";

import { InputHTMLAttributes, ReactNode } from "react";
import { FieldLabel, FieldMessage, useFieldIds } from "./Field";
import { controlClasses } from "./field-classes";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
  /**
   * Masque le libellé à l'écran tout en le gardant comme nom accessible (`sr-only`) : champ
   * d'une ligne de tableau ou d'un éditeur dont la colonne ou le contexte nomme déjà la donnée.
   */
  readonly hideLabel?: boolean;
  readonly error?: string;
  /** Aide affichée sous le champ (remplacée par l'erreur quand il y en a une). */
  readonly hint?: ReactNode;
}

/** Champ texte avec libellé, aide et erreur (docs/design-system/components/Field.md). */
export default function Input({
  label,
  hideLabel = false,
  error,
  hint,
  id,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: Readonly<InputProps>) {
  const { controlId, messageId, ariaDescribedBy } = useFieldIds({ id, hint, error, describedBy });

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <FieldLabel htmlFor={controlId} hidden={hideLabel}>
          {label}
        </FieldLabel>
      )}
      <input
        id={controlId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={`${controlClasses(Boolean(error))} ${className}`}
        {...props}
      />
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}
