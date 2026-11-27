"use client";

import { ReactNode } from "react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmModalProps {
  readonly open: boolean;
  /** La question (« Supprimer la fiche de Marie Kouassi ? »). */
  readonly title: string;
  /** La conséquence de l'action. */
  readonly message: string;
  /** Répète le verbe (« Supprimer la fiche »). */
  readonly confirmLabel?: string;
  /** Libellé pendant l'envoi (« Suppression en cours… ») ; défaut « En cours… ». */
  readonly confirmingLabel?: string;
  /**
   * Libellé du bouton qui renonce (défaut « Annuler »). À changer quand l'action confirmée est
   * elle-même une annulation : « Annuler ma réponse » / « Garder ma réponse ».
   */
  readonly cancelLabel?: string;
  /** `danger` (défaut) pour une action destructive ou irréversible. */
  readonly variant?: "danger" | "primary";
  readonly confirming?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly children?: ReactNode;
}

/**
 * Confirmation d'une action (docs/design-system/components/Dialog.md) : feuille du bas sur
 * mobile, dialogue de 480px sur desktop, actions à droite avec la principale en dernier.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  confirmingLabel = "En cours…",
  cancelLabel = "Annuler",
  variant = "danger",
  confirming = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} mobileLayout="sheet">
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-[22px] text-ink-muted">{message}</p>
        {children}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            disabled={confirming}
            aria-busy={confirming || undefined}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
