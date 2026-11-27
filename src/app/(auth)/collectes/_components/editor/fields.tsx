"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, Copy, Trash2 } from "lucide-react";
import { Checkbox, IconButton, Input, StatusChip } from "@/components/ui";

/** Briques communes de l'éditeur de campagne (spec 091). */

/** « 12,5 » → 12.5 ; vide → undefined ; illisible → "invalid". */
export function parseNumberText(text: string, integer: boolean): number | undefined | "invalid" {
  const t = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "") return undefined;
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(t)) return "invalid";
  const n = Number(t);
  if (integer && !Number.isInteger(n)) return "invalid";
  return n;
}

const formatNumber = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));

/** Nombre facultatif, virgule française, saisie illisible signalée sans être appliquée. */
export function NumberField({
  label,
  value,
  onChange,
  integer = false,
  hint,
  onInvalid,
}: {
  readonly label: string;
  readonly value: number | undefined;
  readonly onChange: (v: number | undefined) => void;
  readonly integer?: boolean;
  readonly hint?: ReactNode;
  /** Saisie illisible à l'écran (bloque l'enregistrement). */
  readonly onInvalid?: (invalid: boolean) => void;
}) {
  const [text, setText] = useState(() => formatNumber(value));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value));
  }, [value]);
  useEffect(() => {
    if (!error || !onInvalid) return;
    onInvalid(true);
    return () => onInvalid(false);
  }, [error, onInvalid]);
  return (
    <Input
      label={label}
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      value={text}
      hint={hint}
      error={error ?? undefined}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (!error) setText(formatNumber(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseNumberText(e.target.value, integer);
        if (parsed === "invalid") return setError(integer ? "Un nombre entier est attendu" : "Un nombre est attendu (ex. 12,5)");
        setError(null);
        onChange(parsed);
      }}
    />
  );
}

/** Case à cocher avec libellé, cible tactile de 44 px. */
export function CheckField({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly hint?: ReactNode;
}) {
  return (
    <label className={`flex min-h-11 items-start gap-3 py-2 text-[15px] leading-[22px] text-ink ${disabled ? "opacity-70" : "cursor-pointer"}`}>
      <Checkbox checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-px" />
      <span className="min-w-0">
        {label}
        {hint && <span className="block text-[13px] leading-[18px] text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Monter, descendre, dupliquer, supprimer : boutons d'une ligne réordonnable. */
export function RowActions({
  name,
  index,
  count,
  onMove,
  onDuplicate,
  onRemove,
  canRemove = true,
  children,
}: {
  /** Nom de l'élément pour les libellés accessibles (« la question « Effectif » »). */
  readonly name: string;
  readonly index: number;
  readonly count: number;
  readonly onMove: (delta: number) => void;
  readonly onDuplicate?: () => void;
  readonly onRemove: () => void;
  readonly canRemove?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center">
      {children}
      <IconButton icon={ArrowUp} aria-label={`Monter ${name}`} disabled={index === 0} onClick={() => onMove(-1)} />
      <IconButton icon={ArrowDown} aria-label={`Descendre ${name}`} disabled={index === count - 1} onClick={() => onMove(1)} />
      {onDuplicate && <IconButton icon={Copy} aria-label={`Dupliquer ${name}`} onClick={onDuplicate} />}
      <IconButton icon={Trash2} aria-label={`Supprimer ${name}`} disabled={!canRemove} onClick={onRemove} />
    </div>
  );
}

/** Erreurs d'un élément, sous son en-tête. */
export function IssueList({ issues }: { readonly issues?: readonly string[] }) {
  if (!issues || issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((m, i) => (
        <li key={i} className="flex items-start gap-1 text-[13px] leading-[18px] text-danger">
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.75} />
          <span className="break-words">{m}</span>
        </li>
      ))}
    </ul>
  );
}

/** Nombre d'erreurs dans un bloc replié. */
export function IssueCount({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <StatusChip tone="danger" className="shrink-0">
      {count} erreur{count > 1 ? "s" : ""}
    </StatusChip>
  );
}

/** Bouton de repli d'un bloc (en-tête cliquable). */
export function Disclosure({
  open,
  onToggle,
  children,
  id,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  /** Élément déplié contrôlé. */
  readonly id: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ChevronDown
        aria-hidden="true"
        className={`size-5 shrink-0 text-ink-muted transition-transform ${open ? "" : "-rotate-90"}`}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
