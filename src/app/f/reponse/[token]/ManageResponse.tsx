"use client";

import { useState } from "react";
import FormFiller, { visibleAnswers } from "@/components/forms/FormFiller";
import type { Answers, FillerForm } from "@/components/forms/types";
import OfferPanel from "@/components/forms/OfferPanel";
import { Alert, Button } from "@/components/ui";

const STATUS: Record<string, string> = {
  CONFIRMED: "Votre réponse est enregistrée.",
  WAITLISTED: "Vous êtes en liste d'attente : vous serez prévenu(e) si une place se libère.",
  OFFERED: "Une place vous est proposée.",
  CANCELLED: "Votre réponse est annulée.",
  DECLINED: "Vous avez décliné la place proposée.",
  EXPIRED: "La place proposée n'a pas été confirmée à temps.",
};

export default function ManageResponse({
  token,
  form,
  status: initialStatus,
  answers: initial,
  editable,
  offerExpiresAt,
}: {
  readonly token: string;
  readonly form: FillerForm;
  readonly status: string;
  readonly answers: Answers;
  readonly editable: boolean;
  readonly offerExpiresAt: string | null;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const open = ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(status);

  async function call(method: "PATCH" | "DELETE") {
    if (method === "DELETE" && !confirm("Annuler votre réponse ?")) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/forms/public/responses/${token}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PATCH" ? JSON.stringify({ answers: visibleAnswers(form, answers) }) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "danger", text: body.error ?? "La demande n'a pas abouti." });
    setStatus(body.status);
    setMessage({ tone: "success", text: method === "PATCH" ? "Modifications enregistrées." : "Votre réponse est annulée." });
  }

  return (
    <div className="space-y-5">
      <Alert tone={open ? "success" : "info"} title={STATUS[status] ?? status} />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {status === "OFFERED" && (
        <OfferPanel
          url={`/api/forms/public/responses/${token}/offer`}
          expiresAt={offerExpiresAt}
          onDone={(next) => {
            setStatus(next);
            setMessage({ tone: "success", text: next === "CONFIRMED" ? "Place acceptée : votre inscription est confirmée." : "Place déclinée." });
          }}
        />
      )}
      {open && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void call("PATCH");
          }}
        >
          <FormFiller form={form} answers={answers} onChange={setAnswers} disabled={busy || !editable} />
          {editable ? (
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                Enregistrer les modifications
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void call("DELETE")}>
                Annuler ma réponse
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Le formulaire n&apos;accepte plus de modification.</p>
          )}
        </form>
      )}
    </div>
  );
}
