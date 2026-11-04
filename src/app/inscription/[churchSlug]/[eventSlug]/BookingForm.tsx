"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import OptionField, { optionAmount, toSelections, type Choices } from "@/components/ticketing/OptionField";
import TurnstileWidget from "@/components/TurnstileWidget";
import { Alert, Button, Checkbox, Input, Modal, Select } from "@/components/ui";
import {
  AGE_GROUP_LABEL,
  PAYMENT_METHOD_LABEL,
  formatEuros,
  isMinor,
  type PublicEvent,
} from "@/modules/ticketing/schemas";
import type { TicketingAgeGroup } from "@/generated/prisma/enums";

interface ParticipantDraft {
  firstName: string;
  lastName: string;
  ageGroup: TicketingAgeGroup;
  options: Choices;
}

const emptyParticipant = (ageGroup: TicketingAgeGroup): ParticipantDraft => ({ firstName: "", lastName: "", ageGroup, options: {} });

function RecoverModal({ event, siteKey, onClose }: { readonly event: PublicEvent; readonly siteKey: string; readonly onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function submit() {
    setState("sending");
    const res = await fetch(`/api/ticketing/public/${event.churchSlug}/${event.slug}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, turnstileToken: token ?? undefined }),
    });
    setState(res.ok ? "sent" : "error");
  }
  return (
    <Modal open onClose={onClose} title="Retrouver ma réservation" mobileLayout="sheet">
      {state === "sent" ? (
        <Alert tone="success" title="Demande envoyée.">
          Si une réservation existe pour cette adresse, vous allez recevoir son lien par email.
        </Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] text-ink-muted">Indiquez l&apos;email utilisé pour réserver : nous y renvoyons le lien de votre réservation.</p>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TurnstileWidget siteKey={siteKey} onToken={setToken} />
          {state === "error" && <Alert tone="danger">La demande n&apos;a pas abouti. Réessayez dans un instant.</Alert>}
          <Button type="button" disabled={!email || !token || state === "sending"} onClick={submit}>
            {state === "sending" ? "Envoi…" : "Recevoir le lien"}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Formulaire d'inscription par étapes (spec 074) : participants et options, questions et contact, récapitulatif. */
export default function BookingForm({
  event,
  turnstileSiteKey,
  prefill,
}: {
  readonly event: PublicEvent;
  readonly turnstileSiteKey: string;
  readonly prefill: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const ageGroups = event.tariffs.map((t) => t.ageGroup);
  const firstAge = ageGroups.includes("ADULT") ? "ADULT" : ageGroups[0] ?? "ADULT";
  const tariff = (g: TicketingAgeGroup) => event.tariffs.find((t) => t.ageGroup === g)?.price ?? 0;
  const participantOptions = event.options.filter((o) => o.scope === "PARTICIPANT");
  const bookingOptions = event.options.filter((o) => o.scope === "BOOKING");

  const [step, setStep] = useState(1);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([emptyParticipant(firstAge)]);
  const [booking, setBooking] = useState<Choices>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ name: prefill?.name ?? "", email: prefill?.email ?? "", phone: "" });
  const [guardian, setGuardian] = useState({ name: "", phone: "", consent: false });
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recover, setRecover] = useState(false);

  const unaccompanied = participants.some((p) => isMinor(p.ageGroup)) && !participants.some((p) => p.ageGroup === "ADULT");
  const total = useMemo(() => {
    let sum = 0;
    for (const p of participants) {
      sum += tariff(p.ageGroup);
      for (const o of participantOptions) sum += optionAmount(o, p.options[o.id]);
    }
    for (const o of bookingOptions) sum += optionAmount(o, booking[o.id]);
    return Math.round(sum * 100) / 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dérivé des saisies seules
  }, [participants, booking]);

  const update = (i: number, patch: Partial<ParticipantDraft>) =>
    setParticipants((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  function stepOneError(): string | null {
    if (participants.some((p) => !p.firstName.trim() || !p.lastName.trim())) return "Indiquez le prénom et le nom de chaque participant.";
    if (participants.length > event.seatsRemaining) return `Il ne reste que ${event.seatsRemaining} place(s).`;
    if (unaccompanied && !event.allowUnaccompaniedMinors) return "Un adulte doit faire partie de la réservation pour accompagner les mineurs.";
    return null;
  }
  function stepTwoError(): string | null {
    const missing = event.questions.find((q) => q.required && !answers[q.id]?.trim());
    if (missing) return `Réponse requise : ${missing.label}`;
    if (!contact.name.trim() || !/^\S+@\S+\.\S+$/.test(contact.email)) return "Indiquez le nom et un email valide pour la réservation.";
    if (unaccompanied && (!guardian.name.trim() || guardian.phone.trim().length < 6 || !guardian.consent)) {
      return "Le responsable légal doit indiquer son nom, son téléphone et donner son autorisation.";
    }
    return null;
  }
  function next() {
    const message = step === 1 ? stepOneError() : stepTwoError();
    setError(message);
    if (!message) setStep(step + 1);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/ticketing/public/${event.churchSlug}/${event.slug}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participants: participants.map((p) => ({
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          ageGroup: p.ageGroup,
          options: toSelections(participantOptions, p.options),
        })),
        bookingOptions: toSelections(bookingOptions, booking),
        answers,
        contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() || null },
        guardian: unaccompanied ? guardian : null,
        turnstileToken: token ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setReset((n) => n + 1);
      setToken(null);
      setError(data.error ?? "La réservation n'a pas abouti. Réessayez.");
      return;
    }
    router.push(`/reservation/${data.manageToken}?nouvelle=1`);
  }

  const recoverLink = (
    <button type="button" className="text-[15px] font-semibold text-brand-text underline" onClick={() => setRecover(true)}>
      Retrouver ma réservation
    </button>
  );

  if (!event.open) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Inscriptions fermées.">{event.closedReason}</Alert>
        {recoverLink}
        {recover && <RecoverModal event={event} siteKey={turnstileSiteKey} onClose={() => setRecover(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-subtle">Étape {step} sur 3</p>
        {recoverLink}
      </div>

      {step === 1 && (
        <section className="space-y-4" aria-label="Participants">
          {participants.map((p, i) => (
            <fieldset key={i} className="space-y-3 rounded-card border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <legend className="font-semibold text-ink">Participant {i + 1}</legend>
                {participants.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setParticipants((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" aria-hidden="true" /> Retirer
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Prénom" autoComplete="given-name" value={p.firstName} onChange={(e) => update(i, { firstName: e.target.value })} />
                <Input label="Nom" autoComplete="family-name" value={p.lastName} onChange={(e) => update(i, { lastName: e.target.value })} />
              </div>
              <Select
                label="Tranche d'âge"
                value={p.ageGroup}
                options={event.tariffs.map((t) => ({ value: t.ageGroup, label: `${AGE_GROUP_LABEL[t.ageGroup]} — ${t.price > 0 ? formatEuros(t.price) : "gratuit"}` }))}
                onChange={(e) => update(i, { ageGroup: e.target.value as TicketingAgeGroup })}
              />
              {participantOptions.map((o) => (
                <OptionField key={o.id} option={o} choice={p.options[o.id]} onChange={(c) => update(i, { options: { ...p.options, [o.id]: c } })} />
              ))}
            </fieldset>
          ))}
          {participants.length < Math.min(20, event.seatsRemaining) && (
            <Button type="button" variant="secondary" onClick={() => setParticipants((l) => [...l, emptyParticipant(firstAge)])}>
              <Plus className="size-4" aria-hidden="true" /> Ajouter un participant
            </Button>
          )}
          {bookingOptions.length > 0 && (
            <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
              <legend className="font-semibold text-ink">Pour la réservation</legend>
              {bookingOptions.map((o) => (
                <OptionField key={o.id} option={o} choice={booking[o.id]} onChange={(c) => setBooking((b) => ({ ...b, [o.id]: c }))} />
              ))}
            </fieldset>
          )}
          <p className="text-[13px] text-ink-muted">Places restantes : {event.seatsRemaining}</p>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4" aria-label="Contact">
          {event.questions.map((q) => (
            <Input
              key={q.id}
              label={`${q.label}${q.required ? "" : " (facultatif)"}`}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          ))}
          <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
            <legend className="font-semibold text-ink">Contact de la réservation</legend>
            <Input label="Nom" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <Input label="Email" type="email" autoComplete="email" hint="Vos billets et le lien de votre réservation y seront envoyés." value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <Input label="Téléphone (facultatif)" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </fieldset>
          {unaccompanied && (
            <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
              <legend className="font-semibold text-ink">Responsable légal</legend>
              <p className="text-[13px] text-ink-muted">Un mineur sans adulte dans la réservation exige un responsable joignable pendant l&apos;événement.</p>
              <Input label="Nom du responsable" value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} />
              <Input label="Téléphone joignable pendant l'événement" type="tel" value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} />
              <label className="flex min-h-11 items-start gap-3">
                <Checkbox checked={guardian.consent} onChange={(e) => setGuardian({ ...guardian, consent: e.target.checked })} />
                <span className="text-[15px] text-ink">J&apos;autorise le mineur à participer à l&apos;événement sans être accompagné.</span>
              </label>
            </fieldset>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4" aria-label="Récapitulatif">
          <div className="rounded-card border border-line bg-surface p-4">
            <ul className="space-y-1 text-[15px] text-ink">
              {participants.map((p, i) => (
                <li key={i}>
                  {p.firstName} {p.lastName} — {AGE_GROUP_LABEL[p.ageGroup]}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-lg font-bold text-ink">Total : {total > 0 ? formatEuros(total) : "gratuit"}</p>
          </div>
          {total > 0 && event.methods.length > 0 && (
            <Alert tone="info" title="Paiement après l'inscription.">
              Moyens acceptés : {event.methods.map((m) => PAYMENT_METHOD_LABEL[m]).join(", ")}. Les instructions et la référence à
              indiquer s&apos;affichent juste après, et vous sont envoyées par email. Vos billets sont émis tout de suite.
            </Alert>
          )}
          <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} resetSignal={reset} />
        </section>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex gap-3">
        {step > 1 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)} disabled={submitting}>
            Retour
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" onClick={next}>
            Continuer
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={submitting || !token}>
            {submitting ? "Réservation…" : "Confirmer la réservation"}
          </Button>
        )}
      </div>
      {recover && <RecoverModal event={event} siteKey={turnstileSiteKey} onClose={() => setRecover(false)} />}
    </div>
  );
}
