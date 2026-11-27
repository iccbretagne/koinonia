"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { Upload, type LucideIcon } from "lucide-react";
import { FieldLabel, FieldMessage, useFieldIds } from "./Field";
import { buttonClasses, type Size, type Variant } from "./button-classes";

interface FileInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "children" | "size"> {
  /** Libellé du champ au-dessus du bouton (« Justificatif »). */
  readonly label?: string;
  readonly hideLabel?: boolean;
  /** Texte du bouton ; défaut « Choisir un fichier » ou « Choisir des fichiers » (`multiple`). */
  readonly buttonLabel?: ReactNode;
  /** Icône 16 px avant le texte du bouton ; `null` pour aucune. */
  readonly icon?: LucideIcon | null;
  readonly variant?: Variant;
  readonly size?: Size;
  readonly hint?: ReactNode;
  readonly error?: string;
  /** Fichiers choisis (liste vide si la personne annule). */
  readonly onFiles?: (files: File[]) => void;
  /**
   * Vide le champ après chaque choix (envoi immédiat : déposer, remplacer). Le même fichier peut
   * alors être choisi de nouveau, et aucun nom n'est affiché.
   */
  readonly resetAfterSelect?: boolean;
  /** Noms affichés à côté du bouton ; défaut : ceux du dernier choix. */
  readonly fileNames?: readonly string[];
  readonly ref?: Ref<HTMLInputElement>;
}

/** Résumé lisible des fichiers choisis (« photo.jpg », « 3 fichiers choisis »). */
export function fileNamesSummary(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 3) return names.join(", ");
  return `${names.length} fichiers choisis`;
}

/**
 * Sélecteur de fichier (docs/design-system/components/FileInput.md) : un bouton du design system
 * (44 px) qui enveloppe un `<input type="file">` masqué mais focalisable — le focus clavier se voit
 * sur le bouton, le libellé et l'aide restent liés au champ — puis le nom du fichier choisi. Pas de
 * bouton natif « Parcourir… » ni de texte en 13 px qui fait zoomer iOS.
 */
export default function FileInput({
  label,
  hideLabel = false,
  buttonLabel,
  icon = Upload,
  variant = "secondary",
  size = "md",
  hint,
  error,
  onFiles,
  onChange,
  resetAfterSelect = false,
  fileNames,
  multiple,
  disabled,
  id,
  className = "",
  "aria-describedby": describedBy,
  ...props
}: Readonly<FileInputProps>) {
  const { controlId, messageId, ariaDescribedBy } = useFieldIds({ id, hint, error, describedBy });
  const [picked, setPicked] = useState<string[]>([]);
  const Icon = icon;
  const names = fileNames ?? (resetAfterSelect ? [] : picked);
  const summary = fileNamesSummary(names);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <FieldLabel htmlFor={controlId} hidden={hideLabel}>
          {label}
        </FieldLabel>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <label
          className={`${buttonClasses(variant, size)} self-start
            has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus
            has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 has-[:disabled]:active:scale-100`}
        >
          {Icon && <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />}
          {buttonLabel ?? (multiple ? "Choisir des fichiers" : "Choisir un fichier")}
          <input
            id={controlId}
            type="file"
            multiple={multiple}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={ariaDescribedBy}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (!resetAfterSelect) setPicked(files.map((f) => f.name));
              onChange?.(e);
              onFiles?.(files);
              if (resetAfterSelect) e.target.value = "";
            }}
            {...props}
          />
        </label>
        {summary && (
          <span aria-live="polite" className="min-w-0 break-all text-sm leading-5 text-ink-muted">
            {summary}
          </span>
        )}
      </div>
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}
