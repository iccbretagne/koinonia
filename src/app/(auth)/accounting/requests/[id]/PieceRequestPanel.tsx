"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal, Textarea, useToast } from "@/components/ui";

type DateLike = string | Date;

const fmt = (d: DateLike) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

/** « Demander une pièce » (spec 086) : côté compta, la demande et sa relance ; côté demandeur, le dépôt. */
export default function PieceRequestPanel({
  requestId,
  status,
  requestedAt,
  lastAt,
  count,
  note,
  canManage,
  isOwn,
  submitterActive,
}: {
  readonly requestId: string;
  readonly status: string;
  readonly requestedAt: DateLike | null;
  readonly lastAt: DateLike | null;
  readonly count: number;
  readonly note: string | null;
  readonly canManage: boolean;
  readonly isOwn: boolean;
  readonly submitterActive: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  if (status === "CANCELLED" || status === "REJECTED") return null;
  const requested = requestedAt !== null;
  if (!requested && !canManage) return null;

  async function run(req: () => Promise<Response>, success: string) {
    setBusy(true);
    try {
      const res = await req();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Action impossible. Réessayez dans un instant.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error("Action impossible. Réessayez dans un instant.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/accounting/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  async function send() {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const ok = await run(() => fetch(`/api/accounting/requests/${requestId}/pieces`, { method: "POST", body: form }), "Pièces envoyées à la comptabilité");
    if (ok) setFiles([]);
  }

  const relances = count - 1;

  return (
    <div className="space-y-3">
      {requested && requestedAt && (
        <Alert
          tone="warning"
          title={`Pièce demandée le ${fmt(requestedAt)}${relances > 0 && lastAt ? ` · relancée ${relances} fois, le ${fmt(lastAt)}` : ""}.`}
        >
          {note ?? "La comptabilité attend une pièce de votre part."}
        </Alert>
      )}

      {requested && isOwn && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <label className="block text-sm font-medium text-ink" htmlFor="piece-files">
            Déposer les pièces demandées (JPEG, PNG ou PDF, 5 Mo chacune)
          </label>
          <input
            id="piece-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-ink"
          />
          <Button size="sm" disabled={busy || files.length === 0} onClick={send}>
            {busy ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {submitterActive ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
              {requested ? "Relancer" : "Demander une pièce"}
            </Button>
          ) : (
            <p className="text-sm text-ink-muted">Le demandeur n&apos;a plus de compte dans l&apos;église : impossible de lui demander une pièce.</p>
          )}
          {requested && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => patch({ action: "cancelPieceRequest" }), "Demande de pièce annulée")}
            >
              Annuler la demande
            </Button>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={requested ? "Relancer la demande de pièce" : "Demander une pièce"}>
        <div className="space-y-4">
          <Textarea
            label="Message (facultatif)"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Merci de joindre la facture du magasin"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const ok = await run(
                  () => patch({ action: "requestPiece", note: message.trim() || undefined }),
                  requested ? "Relance envoyée" : "Pièce demandée"
                );
                if (ok) {
                  setOpen(false);
                  setMessage("");
                }
              }}
            >
              Envoyer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
