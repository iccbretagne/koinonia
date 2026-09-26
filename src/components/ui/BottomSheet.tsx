"use client";

import { ReactNode, useId, useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import { useModalDialog } from "./use-modal-dialog";

interface BottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Titre visible ; sans titre, `aria-label` nomme la feuille (défaut « Menu »). */
  readonly title?: ReactNode;
  readonly "aria-label"?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Distance de glissement vers le bas (px) au-delà de laquelle la feuille se ferme. */
const SWIPE_CLOSE_THRESHOLD = 80;

/**
 * Feuille qui monte du bas de l'écran (docs/design-system/components/BottomSheet.md) : menu
 * « Plus », choix rapide. `<dialog>` natif (focus piégé, retour du focus). Se ferme par Échap,
 * appui sur le voile, bouton Fermer ou glissement vers le bas depuis la poignée. Sur desktop,
 * elle reste ancrée en bas, limitée à 560px et centrée.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  "aria-label": ariaLabel,
  children,
  className = "",
}: BottomSheetProps) {
  const dialogRef = useModalDialog(open);
  const titleId = useId();
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  if (!open) return null;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  }

  function onPointerEnd() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    const shouldClose = dragY > SWIPE_CLOSE_THRESHOLD;
    setDragY(0);
    if (shouldClose) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Appui sur le voile : la cible est le <dialog> lui-même (le contenu le remplit).
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : (ariaLabel ?? "Menu")}
      style={dragY ? { translate: `0 ${dragY}px`, transition: "none" } : undefined}
      className={`m-0 mt-auto h-fit max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-sheet border-0
        bg-surface p-0 text-ink shadow-overlay backdrop:bg-scrim
        transition-[translate] duration-[280ms] ease-out starting:open:translate-y-full
        md:mx-auto md:max-w-[560px] ${className}`}
    >
      <div
        className="sticky top-0 z-10 cursor-grab touch-none bg-surface px-4 pt-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-9 rounded-full bg-line" />
        <div className="flex min-h-11 items-center justify-between gap-3">
          {title ? (
            <h2 id={titleId} className="min-w-0 font-display text-[17px] font-semibold leading-6 text-ink">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <IconButton
            icon={X}
            aria-label="Fermer"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="-mr-2"
          />
        </div>
      </div>
      <div data-dialog-body className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">{children}</div>
    </dialog>
  );
}
