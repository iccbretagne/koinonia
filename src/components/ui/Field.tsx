"use client";

import { useId, type ReactNode } from "react";
import { CircleX } from "lucide-react";
import { fieldErrorClasses, fieldHintClasses, fieldLabelClasses } from "./field-classes";

/**
 * Briques communes à Input, Select et Textarea : identifiants stables, libellé au-dessus, aide
 * puis erreur (l'erreur remplace l'aide) reliées au contrôle par `aria-describedby`.
 */
export function useFieldIds({
  id,
  hint,
  error,
  describedBy,
}: {
  id?: string;
  hint?: ReactNode;
  error?: ReactNode;
  describedBy?: string;
}) {
  const generated = useId();
  const controlId = id || generated;
  const messageId = `${controlId}-message`;
  const hasMessage = Boolean(error) || Boolean(hint);
  const ariaDescribedBy =
    [describedBy, hasMessage ? messageId : null].filter(Boolean).join(" ") || undefined;
  return { controlId, messageId, ariaDescribedBy };
}

export function FieldLabel({ htmlFor, children }: { readonly htmlFor: string; readonly children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={fieldLabelClasses}>
      {children}
    </label>
  );
}

export function FieldMessage({
  id,
  hint,
  error,
}: {
  readonly id: string;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
}) {
  if (error) {
    return (
      <p id={id} className={fieldErrorClasses}>
        <CircleX aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.75} />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className={fieldHintClasses}>
        {hint}
      </p>
    );
  }
  return null;
}
