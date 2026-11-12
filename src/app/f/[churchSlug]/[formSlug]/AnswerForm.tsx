"use client";

import { useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";
import FormFiller, { visibleAnswers } from "@/components/forms/FormFiller";
import type { Answers, FillerForm } from "@/components/forms/types";
import { Alert, Button } from "@/components/ui";

type Existing = { status: string; answers: Answers } | null;

/** Envoi, ou modification de sa réponse pour un compte connecté (spec 079). */
export default function AnswerForm({
  form,
  churchSlug,
  formSlug,
  turnstileSiteKey,
  signedIn,
  existing,
}: {
  readonly form: FillerForm;
  readonly churchSlug: string;
  readonly formSlug: string;
  readonly turnstileSiteKey: string | null;
  readonly signedIn: boolean;
  readonly existing: Existing;
}) {
  const [answers, setAnswers] = useState<Answers>(existing?.answers ?? {});
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; manageToken: string | null } | null>(null);
  const editing = !!existing && signedIn;

  async function send() {
    setState("sending");
    setError(null);
    const url = editing ? `/api/forms/mine/${form.id}` : `/api/forms/public/${churchSlug}/${formSlug}/responses`;
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: visibleAnswers(form, answers), ...(turnstileSiteKey ? { turnstileToken: token } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "La réponse n'a pas pu être envoyée. Réessayez dans un instant.");
      setState("idle");
      setReset((n) => n + 1);
      return;
    }
    setResult({ status: body.status, manageToken: body.manageToken ?? null });
    setState("done");
  }

  async function cancel() {
    if (!confirm("Annuler votre réponse ?")) return;
    const res = await fetch(`/api/forms/mine/${form.id}`, { method: "DELETE" });
    if (res.ok) setState("cancelled");
    else setError((await res.json().catch(() => ({}))).error ?? "L'annulation n'a pas abouti.");
  }

  if (state === "cancelled") return <Alert tone="info" title="Votre réponse est annulée." />;
  if (state === "done" && result) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={editing ? "Votre réponse est modifiée." : "Merci, votre réponse est enregistrée."}>
          {result.status === "WAITLISTED" && "Vous êtes en liste d'attente : vous serez prévenu(e) si une place se libère. "}
          {!form.anonymous && !signedIn && "Un accusé de réception vous a été envoyé par email, avec un lien pour modifier ou annuler votre réponse."}
          {!form.anonymous && signedIn && "Vous pourrez la retrouver et la modifier depuis cette page tant que le formulaire est ouvert."}
        </Alert>
        {result.manageToken && (
          <a href={`/f/reponse/${result.manageToken}`} className="inline-block text-[15px] font-semibold text-brand-text underline">
            Gérer ma réponse
          </a>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {editing && <Alert tone="info" title="Vous avez déjà répondu : vous pouvez modifier ou annuler votre réponse." />}
      <FormFiller form={form} answers={answers} onChange={setAnswers} disabled={state === "sending"} />
      {turnstileSiteKey && !editing && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} resetSignal={reset} />}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={state === "sending" || (!!turnstileSiteKey && !editing && !token)}>
          {state === "sending" ? "Envoi…" : editing ? "Enregistrer les modifications" : "Envoyer"}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" onClick={() => void cancel()}>
            Annuler ma réponse
          </Button>
        )}
      </div>
    </form>
  );
}
