"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Alert from "@/components/ui/Alert";

/**
 * Motif obligatoire d'un refus ou d'une annulation (spec 063), saisi dans le panneau : le bouton
 * de confirmation reste inactif tant que le motif est vide. Le motif est transmis au demandeur.
 */
export default function ReasonForm({
  label,
  confirmLabel,
  warning,
  busy,
  onConfirm,
  onCancel,
}: {
  readonly label: string;
  readonly confirmLabel: string;
  /** Effets en cascade à signaler avant de valider (suites annulées). */
  readonly warning?: ReactNode;
  readonly busy: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const empty = reason.trim() === "";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) onConfirm(reason.trim());
      }}
    >
      <Textarea
        label={label}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        required
        autoFocus
        hint="Le demandeur recevra ce motif dans sa notification."
      />
      {warning && <Alert tone="warning">{warning}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="danger" disabled={empty || busy}>
          {busy ? "Envoi…" : confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Retour
        </Button>
      </div>
    </form>
  );
}
