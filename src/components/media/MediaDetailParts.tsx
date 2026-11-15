"use client";

import type { ReactNode } from "react";
import { Link as LinkIcon, Plus, Upload } from "lucide-react";

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
      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-control-line rounded-xl py-2.5 text-sm text-ink-muted hover:border-brand hover:text-brand-text transition-colors"
    >
      <Plus className="w-4 h-4" aria-hidden="true" />
      {children}
    </button>
  );
}

export function UploadToggleButton({ active, onClick }: { readonly active: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors ${
        active ? "border-brand text-brand-text bg-brand-soft" : "border-line text-ink-muted hover:border-control-line hover:bg-surface-sunken"
      }`}
    >
      <Upload className="w-4 h-4" aria-hidden="true" />
      Importer
    </button>
  );
}
