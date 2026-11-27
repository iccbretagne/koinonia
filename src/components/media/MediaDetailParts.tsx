"use client";

import type { ReactNode } from "react";
import { Link as LinkIcon, Plus, Upload } from "lucide-react";
import FilterChip from "@/components/ui/FilterChip";

/**
 * Éléments communs des fiches « projet de visuels » et « événement photos » : en-tête des liens
 * de partage, bouton d'ajout en pointillés et bascule d'import.
 */

export function ShareLinksHeading({ count }: { readonly count: number }) {
  return (
    <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
      <LinkIcon className="w-4 h-4 text-brand-text" aria-hidden="true" />
      Liens de partage
      {count > 0 && (
        <span className="ml-auto text-xs text-ink-subtle font-normal">
          {count} lien{count > 1 ? "s" : ""}
        </span>
      )}
    </h2>
  );
}

export function DashedAddButton({ onClick, children }: { readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-control-line px-4 py-2 font-display text-sm font-semibold text-ink-muted transition-colors duration-120
        hover:border-brand hover:bg-brand-soft hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} />
      {children}
    </button>
  );
}

export function UploadToggleButton({ active, onClick }: { readonly active: boolean; readonly onClick: () => void }) {
  return (
    <FilterChip pressed={active} onClick={onClick}>
      <Upload className="size-4" aria-hidden="true" strokeWidth={1.75} />
      Importer
    </FilterChip>
  );
}
