"use client";

import { SubmitEvent, useId, useState } from "react";
import { CircleCheck } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { Alert, Button, Input, Textarea, fieldLabelClasses } from "@/components/ui";
import { choiceChipClasses } from "@/components/ui/RadioGroup";

interface Props {
  readonly churchSlug: string;
  readonly churchName: string;
  readonly turnstileSiteKey: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"];
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"];
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"];

const cardClasses = "flex flex-col gap-4";
const sectionTitleClasses = "font-display text-[17px] font-semibold text-ink";

function FieldError({ message }: { readonly message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[13px] text-danger">{message}</p>;
}

function RadioGroup({ name, options, value, onChange }: {
  readonly name: string; readonly options: string[]; readonly value: string; readonly onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className={choiceChipClasses(value === opt)}>
          <input type="radio" name={name} value={opt} checked={value === opt}
            onChange={() => onChange(opt)} className="sr-only" />
          {opt}
        </label>
      ))}
    </div>
  );
}

export default function PublicRequestForm({ churchSlug, churchName, turnstileSiteKey }: Props) {
  const id = useId();
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    gender: "",
    phone: "",
    email: "",
    ageRange: "",
    membershipDuration: "",
    isStar: "",
    department: "",
    motifs: [] as string[],
    details: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleMotif(motif: string) {
    setForm((f) => ({
      ...f,
      motifs: f.motifs.includes(motif) ? f.motifs.filter((m) => m !== motif) : [...f.motifs, motif],
    }));
    if (fieldErrors["motifs"]) setFieldErrors((e) => ({ ...e, motifs: undefined }));
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!turnstileToken) { setGlobalError("Veuillez compléter la vérification anti-robots ci-dessus."); return; }
    setSubmitting(true); setGlobalError(null); setFieldErrors({});

    try {
      const res = await fetch("/api/care/requests/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchSlug, ...form,
          department: form.department || null,
          details: form.details.trim() || undefined,
          turnstileToken,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.details?.length) {
          const errs: FieldErrors = {};
          for (const d of json.details as { field: string; message: string }[]) {
            errs[d.field] = d.message;
          }
          setFieldErrors(errs);
          setGlobalError("Veuillez corriger les erreurs ci-dessous.");
        } else {
          setGlobalError(json.error ?? "Une erreur est survenue. Veuillez réessayer.");
        }
        // Jeton à usage unique : un nouveau défi est nécessaire pour réessayer.
        setTurnstileReset((n) => n + 1);
      } else {
        setSuccess(true);
      }
    } catch {
      setGlobalError("Une erreur réseau est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CircleCheck aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </span>
        <h2 className="font-display text-[17px] font-semibold text-ink">Demande envoyée</h2>
        <p className="text-sm text-ink-muted">
          Votre demande de rendez-vous auprès de <strong>{churchName}</strong>{" "}a bien été reçue.
          Un email de confirmation vous a été envoyé. L&apos;équipe pastorale vous contactera prochainement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Coordonnées */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Vos coordonnées</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input id={`${id}-f1`} label="Nom" type="text" required autoComplete="family-name" value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)} error={fieldErrors.lastName} />
          <Input id={`${id}-f2`} label="Prénom" type="text" required autoComplete="given-name" value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)} error={fieldErrors.firstName} />
        </div>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Sexe</legend>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender} onChange={(v) => set("gender", v)} />
          <FieldError message={fieldErrors.gender} />
        </fieldset>

        <Input id={`${id}-f3`} label="Téléphone" type="tel" required autoComplete="tel" value={form.phone}
          onChange={(e) => set("phone", e.target.value)} error={fieldErrors.phone} />
        <Input id={`${id}-f4`} label="Adresse mail" type="email" required autoComplete="email" value={form.email}
          onChange={(e) => set("email", e.target.value)} error={fieldErrors.email} />
      </section>

      {/* Profil */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Votre profil</h2>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Tranche d&apos;âge</legend>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange} onChange={(v) => set("ageRange", v)} />
          <FieldError message={fieldErrors.ageRange} />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Depuis quand êtes-vous à {churchName} ?</legend>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration} onChange={(v) => set("membershipDuration", v)} />
          <FieldError message={fieldErrors.membershipDuration} />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>Êtes-vous STAR ?</legend>
          <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar} onChange={(v) => set("isStar", v)} />
          <FieldError message={fieldErrors.isStar} />
        </fieldset>

        {form.isStar === "Oui" && (
          <Input id={`${id}-f5`} label="Dans quel département servez-vous ? (facultatif)" type="text" value={form.department}
            onChange={(e) => set("department", e.target.value)} placeholder="Ex : Choristes, Accueil, Son…" error={fieldErrors.department} />
        )}
      </section>

      {/* Motif */}
      <section className={cardClasses}>
        <h2 className={sectionTitleClasses}>Votre demande</h2>

        <fieldset className="min-w-0">
          <legend className={`${fieldLabelClasses} mb-2`}>
            Pour quel motif sollicitez-vous un entretien ? <span className="font-normal text-ink-muted">(plusieurs choix possibles)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((motif) => (
              <label key={motif} className={choiceChipClasses(form.motifs.includes(motif))}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          <FieldError message={fieldErrors.motifs} />
        </fieldset>

        <Textarea
          id={`${id}-f6`}
          label="Votre message (facultatif)"
          value={form.details}
          onChange={(e) => set("details", e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Décrivez votre situation ou ce que vous souhaitez aborder…"
          error={fieldErrors.details}
          hint="Ce message n'est lu que par l'équipe qui confie votre demande et par le référent qui vous accompagnera."
        />
      </section>

      {/* Turnstile */}
      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="mt-1 text-xs text-ink-muted">Vérification anti-robots requise pour envoyer la demande.</p>}
      </div>

      {globalError && <Alert tone="danger">{globalError}</Alert>}

      <Button type="submit" disabled={submitting || !turnstileToken} className="w-full">
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>

      <p className="text-center text-xs text-ink-muted">
        Un email de confirmation vous sera envoyé.
      </p>
    </form>
  );
}
