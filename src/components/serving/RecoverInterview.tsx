"use client";

import { useState, type SubmitEvent } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { Alert, Button, Input, Modal } from "@/components/ui";

/** « Retrouver mon rendez-vous » (spec 082) : renvoie le lien à l'adresse, même réponse si inconnue. */
export default function RecoverInterview({ churchSlug, turnstileSiteKey }: { readonly churchSlug: string; readonly turnstileSiteKey: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!token) return setError("Merci de valider la vérification anti-robots.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/serving/public/interview/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ churchSlug, email, turnstileToken: token }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setReset((n) => n + 1);
    if (!res.ok) return setError(json.error ?? "La demande n'a pas abouti.");
    setDone(true);
  }

  return (
    <>
      <p className="text-center text-sm text-ink-muted">
        Déjà candidat ?{" "}
        <button type="button" className="font-semibold text-brand-text underline" onClick={() => setOpen(true)}>
          Retrouver mon rendez-vous
        </button>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="Retrouver mon rendez-vous">
        {done ? (
          <Alert tone="success">
            Si une candidature en cours correspond à cette adresse, tu vas recevoir un email avec le lien de ton rendez-vous.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <Input label="Adresse email de ta fiche" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} resetSignal={reset} />
            <Button type="submit" disabled={busy}>
              {busy ? "Envoi…" : "Recevoir le lien"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
