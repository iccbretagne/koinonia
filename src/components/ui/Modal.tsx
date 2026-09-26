"use client";

import { ReactNode, useId } from "react";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import { useModalDialog } from "./use-modal-dialog";

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly children: ReactNode;
  /** Largeur desktop : `md` = 480px (défaut), `lg` = 640px pour un formulaire dense. */
  readonly size?: "md" | "lg";
  /**
   * Présentation sous 768px : `fullscreen` (défaut, formulaire) avec en-tête collant, ou `sheet`
   * (confirmation courte) en feuille ancrée en bas, qui se ferme aussi par appui sur le voile.
   */
  readonly mobileLayout?: "fullscreen" | "sheet";
}

const desktopWidth = {
  md: "md:w-[480px]",
  lg: "md:w-[640px]",
};

const mobileClasses = {
  fullscreen: "h-full max-h-full w-full",
  sheet: "mt-auto h-fit max-h-[85dvh] w-full rounded-t-sheet",
};

/**
 * Fenêtre modale (docs/design-system/components/Dialog.md) sur `<dialog>` natif : focus piégé,
 * Échap ferme, focus rendu au déclencheur. Desktop : 480px centrée, `rounded-card`,
 * `shadow-overlay`, voile `scrim`. Mobile : plein écran avec en-tête collant, ou feuille du bas.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  mobileLayout = "fullscreen",
}: ModalProps) {
  const dialogRef = useModalDialog(open);
  const titleId = useId();

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={
        mobileLayout === "sheet"
          ? (e) => {
              // Appui sur le voile : la cible est le <dialog> lui-même (le contenu le remplit).
              if (e.target === e.currentTarget) onClose();
            }
          : undefined
      }
      aria-labelledby={titleId}
      className={`m-0 max-w-none overflow-y-auto overscroll-contain border-0 bg-surface p-0 text-ink shadow-overlay
        backdrop:bg-scrim
        transition-[opacity,scale] duration-200 ease-out starting:open:scale-[0.98] starting:open:opacity-0
        ${mobileClasses[mobileLayout]}
        md:m-auto md:h-fit md:max-h-[85vh] md:max-w-[calc(100vw-2rem)] md:rounded-card ${desktopWidth[size]}`}
    >
      <div
        className={`sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface pl-4 pr-2 md:border-b-0 md:pl-6 md:pr-3 md:pt-3 ${
          mobileLayout === "fullscreen"
            ? "border-b border-line pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
            : "pt-2"
        }`}
      >
        <h2 id={titleId} className="min-w-0 font-display text-[17px] font-semibold leading-6 text-ink">
          {title}
        </h2>
        <IconButton icon={X} aria-label="Fermer" onClick={onClose} />
      </div>
      <div data-dialog-body className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-6">{children}</div>
    </dialog>
  );
}
