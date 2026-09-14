"use client";

import { ReactNode } from "react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly variant?: "danger" | "primary";
  readonly confirming?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly children?: ReactNode;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  variant = "danger",
  confirming = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{message}</p>
        {children}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
            Annuler
          </button>
          <Button variant={variant} onClick={onConfirm} disabled={confirming}>
            {confirming ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
