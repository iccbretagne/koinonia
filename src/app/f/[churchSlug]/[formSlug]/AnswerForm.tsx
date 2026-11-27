"use client";

import { useState } from "react";
import Link from "next/link";
import TurnstileWidget from "@/components/TurnstileWidget";
import FormFiller, { visibleAnswers } from "@/components/forms/FormFiller";
import type { Answers, FillerForm } from "@/components/forms/types";
import OfferPanel from "@/components/forms/OfferPanel";
import { Alert, Button, ConfirmModal, Input, Modal, buttonClasses } from "@/components/ui";

type Existing = { status: string; answers: Answers; offerExpiresAt: string | null } | null;

/** « Retrouver ma réponse » : le lien de gestion est renvoyé à l'adresse utilisée pour répondre. */
function RecoverModal({ url, siteKey, onClose }: { readonly url: string; readonly siteKey: string; readonly onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function submit() {
    setState("sending");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, turnstileToken: token ?? undefined }),
    });
    setState(res.ok ? "sent" : "error");
  }
  return (
    <Modal open onClose={onClose} title="Retrouver ma réponse" mobileLayout="sheet">
      {state === "sent" ? (
        <Alert tone="success" title="Demande envoyée.">
          Si une réponse existe pour cette adresse, vous allez recevoir par email le lien pour la consulter, la modifier ou l&apos;annuler.
        </Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] text-ink-muted">Indiquez l&apos;email utilisé pour répondre : nous y renvoyons le lien de votre réponse.</p>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TurnstileWidget siteKey={siteKey} onToken={setToken} />
          {state === "error" && <Alert tone="danger">La demande n&apos;a pas abouti. Réessayez dans un instant.</Alert>}
          {(!email || !token) && (
            <p className="text-[13px] text-ink-muted">Indiquez votre email et terminez la vérification anti-robots pour recevoir le lien.</p>
          )}
          <Button type="button" disabled={!email || !token || state === "sending"} onClick={() => void submit()}>
            {state === "sending" ? "Envoi en cours…" : "Recevoir le lien"}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Envoi, ou modification de sa réponse pour un compte connecté (spec 079). */
export default function AnswerForm({
  form,
  churchSlug,
  formSlug,
  turnstileSiteKey,
  signedIn,
  recoverable,
  existing,
}: {
  readonly form: FillerForm;
  readonly churchSlug: string;
  readonly formSlug: string;
  readonly turnstileSiteKey: string | null;
  readonly signedIn: boolean;
  /** Formulaire public nominatif, personne non connectée : « Retrouver ma réponse » proposé. */
  readonly recoverable: boolean;
  readonly existing: Existing;
}) {
  const [answers, setAnswers] = useState<Answers>(existing?.answers ?? {});
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; manageToken: string | null } | null>(null);
  const editing = !!existing && signedIn;
  const [recovering, setRecovering] = useState(false);
  const [offer, setOffer] = useState(existing?.status === "OFFERED" ? existing.offerExpiresAt : undefined);
  const [offerResult, setOfferResult] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
    setCancelling(true);
    const res = await fetch(`/api/forms/mine/${form.id}`, { method: "DELETE" });
    setCancelling(false);
    setConfirmCancel(false);
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
          <Link href={`/f/reponse/${result.manageToken}`} className={buttonClasses("secondary")}>
            Gérer ma réponse
          </Link>
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
      {editing && existing?.status === "WAITLISTED" && <Alert tone="info" title="Vous êtes en liste d'attente : vous serez prévenu(e) si une place se libère." />}
      {editing && offer !== undefined && (
        <OfferPanel
          url={`/api/forms/mine/${form.id}/offer`}
          expiresAt={offer}
          onDone={(next) => {
            setOffer(undefined);
            setOfferResult(next === "CONFIRMED" ? "Place acceptée : votre inscription est confirmée." : "Place déclinée.");
            if (next !== "CONFIRMED") setState("cancelled");
          }}
        />
      )}
      {offerResult && <Alert tone="success">{offerResult}</Alert>}
      {recoverable && turnstileSiteKey && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] text-ink-muted">Vous avez déjà répondu ?</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRecovering(true)}>
            Retrouver ma réponse
          </Button>
        </div>
      )}
      {recovering && turnstileSiteKey && (
        <RecoverModal url={`/api/forms/public/${churchSlug}/${formSlug}/recover`} siteKey={turnstileSiteKey} onClose={() => setRecovering(false)} />
      )}
      <FormFiller form={form} answers={answers} onChange={setAnswers} disabled={state === "sending"} />
      {turnstileSiteKey && !editing && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} resetSignal={reset} />}
      {error && <Alert tone="danger">{error}</Alert>}
      {!!turnstileSiteKey && !editing && !token && (
        <p className="text-[13px] text-ink-muted">Vérification anti-robots requise pour envoyer la réponse.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={state === "sending" || (!!turnstileSiteKey && !editing && !token)}>
          {state === "sending" ? "Envoi en cours…" : editing ? "Enregistrer les modifications" : "Envoyer ma réponse"}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" onClick={() => setConfirmCancel(true)}>
            Annuler ma réponse
          </Button>
        )}
      </div>
      <ConfirmModal
        open={confirmCancel}
        title="Annuler votre réponse ?"
        message="Votre réponse passe à « Annulée » et votre place éventuelle est libérée."
        confirmLabel="Annuler ma réponse"
        cancelLabel="Garder ma réponse"
        confirmingLabel="Annulation en cours…"
        variant="primary"
        confirming={cancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void cancel()}
      />
    </form>
  );
}
