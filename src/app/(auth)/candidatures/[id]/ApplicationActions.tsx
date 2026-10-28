"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, Textarea, useToast } from "@/components/ui";

/** Actions du PVS sur la candidature (lot 1 : ne pas retenir). */
export default function ApplicationActions({ applicationId, name }: { readonly applicationId: string; readonly name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  async function reject() {
    setSending(true);
    try {
      const res = await fetch(`/api/serving/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: reason.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "La décision n'a pas pu être enregistrée.");
        return;
      }
      toast.success("Candidature non retenue");
      setOpen(false);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ne pas retenir
      </Button>
      <ConfirmModal
        open={open}
        title={`Ne pas retenir la candidature de ${name} ?`}
        message="La fiche reste consultable par le PVS seul, puis est effacée au terme de la durée de conservation."
        confirmLabel="Ne pas retenir"
        confirming={sending}
        onConfirm={reject}
        onCancel={() => setOpen(false)}
      >
        <Textarea label="Motif (facultatif)" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
      </ConfirmModal>
    </div>
  );
}
