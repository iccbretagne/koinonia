"use client";

import { ReactNode, TextareaHTMLAttributes } from "react";
import { FieldLabel, FieldMessage, useFieldIds } from "./Field";
import { textareaClasses } from "./field-classes";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string;
  readonly error?: string;
  /** Aide affichée sous le champ (remplacée par l'erreur quand il y en a une). */
  readonly hint?: ReactNode;
}

/** Zone de texte avec libellé, aide et erreur (docs/design-system/components/Field.md). */
export default function Textarea({
  label,
  error,
  hint,
  id,
  rows = 3,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaProps) {
  const { controlId, messageId, ariaDescribedBy } = useFieldIds({ id, hint, error, describedBy });

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={controlId}>{label}</FieldLabel>}
      <textarea
        id={controlId}
        rows={rows}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={`${textareaClasses(Boolean(error))} ${className}`}
        {...props}
      />
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}
