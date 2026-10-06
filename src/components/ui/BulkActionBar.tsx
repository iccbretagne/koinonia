"use client";

import { useEffect } from "react";
import { Pencil, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  readonly count: number;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}

/** « 1 élément sélectionné », « 3 éléments sélectionnés ». */
export function selectionLabel(count: number): string {
  return count > 1 ? `${count} éléments sélectionnés` : `${count} élément sélectionné`;
}

const inverseControl =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-control " +
  "font-display text-sm font-semibold text-bg transition-[background-color,transform] duration-120 " +
  "hover:bg-bg/15 active:scale-[0.98] motion-reduce:active:scale-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg";
const actionClasses = `${inverseControl} px-2.5 sm:px-3`;

/**
 * Barre flottante des actions groupées (docs/design-system/components/BulkActionBar.md) : fond
 * `ink` inversé, au-dessus de la barre du bas sur mobile. Échap désélectionne (sauf si un
 * dialogue est ouvert : Échap le ferme d'abord). Sous 640px, les actions ne montrent que leur
 * icône (nom accessible conservé).
 */
export default function BulkActionBar({ count, onEdit, onDelete, onClear }: BulkActionBarProps) {
  useEffect(() => {
    if (count === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      onClear();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, onClear]);

  if (count === 0) return null;

  return (
    <section
      aria-label="Actions sur la sélection"
      className="fixed bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1
        rounded-card bg-ink py-1.5 pl-4 pr-1.5 text-bg shadow-float md:bottom-6 print:hidden"
    >
      <span aria-live="polite" className="mr-2 min-w-0 text-[15px] font-semibold leading-[22px] tabular-nums sm:mr-3">
        {selectionLabel(count)}
      </span>
      <button type="button" onClick={onEdit} className={actionClasses} aria-label="Modifier la sélection">
        <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="hidden sm:inline">Modifier</span>
      </button>
      <button type="button" onClick={onDelete} className={actionClasses} aria-label="Supprimer la sélection">
        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="hidden sm:inline">Supprimer</span>
      </button>
      <button type="button" onClick={onClear} className={inverseControl} aria-label="Désélectionner" title="Désélectionner (Échap)">
        <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </button>
    </section>
  );
}
