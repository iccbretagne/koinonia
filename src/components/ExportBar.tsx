"use client";

import type { ReactNode } from "react";
import { ClipboardCopy, FileDown, ImageDown } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Actions d'export du planning (image, presse-papiers, PDF) : boutons secondaires. Sous 640px,
 * seules les icônes restent visibles (le libellé reste lu par les lecteurs d'écran, et en infobulle).
 */
export default function ExportBar({
  exporting,
  onCopy,
  onDownload,
  onPdf,
  pdfLabel = "Exporter en PDF",
  children,
  className = "justify-end",
}: {
  readonly exporting: string | null;
  /** Libellé du bouton PDF (ex. « PDF » pour une impression navigateur). */
  readonly pdfLabel?: string;
  readonly onCopy: () => void;
  readonly onDownload: () => void;
  readonly onPdf: () => void;
  /** Actions supplémentaires, après les exports. */
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button variant="secondary" size="sm" onClick={onCopy} disabled={!!exporting} title="Copier l'image">
        <ClipboardCopy aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only sm:not-sr-only">{exporting === "copy" ? "Copie…" : "Copier l'image"}</span>
      </Button>
      <Button variant="secondary" size="sm" onClick={onDownload} disabled={!!exporting} title="Télécharger en PNG">
        <ImageDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only sm:not-sr-only">{exporting === "image" || exporting === "png" ? "Export…" : "Télécharger en PNG"}</span>
      </Button>
      <Button variant="secondary" size="sm" onClick={onPdf} disabled={!!exporting} title={pdfLabel}>
        <FileDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only sm:not-sr-only">{exporting === "pdf" ? "Export…" : pdfLabel}</span>
      </Button>
      {children}
    </div>
  );
}
