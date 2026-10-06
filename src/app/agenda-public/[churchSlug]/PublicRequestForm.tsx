"use client";

import { FormEvent, useId, useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

interface Props {
  readonly churchSlug: string;
  readonly churchName: string;
  readonly turnstileSiteKey: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"];
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"];
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"];

function FieldError({ errors, field }: { readonly errors: FieldErrors; readonly field: string }) {
  if (!errors[field]) return null;
  return <p className="text-xs text-danger mt-1">{errors[field]}</p>;
}

function inputClass(errors: FieldErrors, field: string, extra = "") {
  return `w-full border-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-brand ${
    errors[field] ? "border-danger bg-danger-soft" : "border-control-line"
  } ${extra}`;
}

function RadioGroup({ name, options, value, onChange, errors }: {
  readonly name: string; readonly options: string[]; readonly value: string;
  readonly onChange: (v: string) => void; readonly errors: FieldErrors;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${errors[name] ? "p-2 rounded-lg border border-danger/30 bg-danger-soft" : ""}`}>
      {options.map((opt) => (
        <label key={opt} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
          value === opt ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
        }`}>
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

  async function handleSubmit(e: FormEvent) {
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
      <div className="bg-surface rounded-xl border border-success/30 p-6 sm:p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-success-soft flex items-center justify-center mx-auto text-2xl">✓</div>
        <h2 className="text-lg font-semibold text-ink">Demande envoyée !</h2>
        <p className="text-sm text-ink-muted">
          Votre demande de rendez-vous auprès de <strong>{churchName}</strong>{" "}a bien été reçue.
          Un email de confirmation vous a été envoyé. L&apos;équipe pastorale vous contactera prochainement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Coordonnées */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Vos coordonnées</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-f1`} className="block text-sm font-medium text-ink-muted mb-1">Nom *</label>
            <input id={`${id}-f1`} type="text" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)}
              className={inputClass(fieldErrors, "lastName")} />
            <FieldError errors={fieldErrors} field="lastName" />
          </div>
          <div>
            <label htmlFor={`${id}-f2`} className="block text-sm font-medium text-ink-muted mb-1">Prénom *</label>
            <input id={`${id}-f2`} type="text" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
              className={inputClass(fieldErrors, "firstName")} />
            <FieldError errors={fieldErrors} field="firstName" />
          </div>
        </div>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Sexe *</legend>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender}
            onChange={(v) => set("gender", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="gender" />
        </fieldset>

        <div>
          <label htmlFor={`${id}-f3`} className="block text-sm font-medium text-ink-muted mb-1">Téléphone *</label>
          <input id={`${id}-f3`} type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)}
            className={inputClass(fieldErrors, "phone")} />
          <FieldError errors={fieldErrors} field="phone" />
        </div>

        <div>
          <label htmlFor={`${id}-f4`} className="block text-sm font-medium text-ink-muted mb-1">Adresse mail *</label>
          <input id={`${id}-f4`} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}
            className={inputClass(fieldErrors, "email")} />
          <FieldError errors={fieldErrors} field="email" />
        </div>
      </div>

      {/* Profil */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Votre profil</h2>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Tranche d&apos;âge *</legend>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange}
            onChange={(v) => set("ageRange", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="ageRange" />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Depuis quand êtes-vous à {churchName} ? *</legend>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration}
            onChange={(v) => set("membershipDuration", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="membershipDuration" />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">Êtes-vous STAR ? *</legend>
          <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar}
            onChange={(v) => set("isStar", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="isStar" />
        </fieldset>

        {form.isStar === "Oui" && (
          <div>
            <label htmlFor={`${id}-f5`} className="block text-sm font-medium text-ink-muted mb-1">Dans quel département servez-vous ?</label>
            <input id={`${id}-f5`} type="text" value={form.department} onChange={(e) => set("department", e.target.value)}
              placeholder="Ex : Choristes, Accueil, Son…"
              className={inputClass(fieldErrors, "department")} />
            <FieldError errors={fieldErrors} field="department" />
          </div>
        )}
      </div>

      {/* Motif */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Votre demande</h2>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Pour quel motif sollicitez-vous un entretien ? * <span className="font-normal text-ink-subtle">(plusieurs choix possibles)</span>
          </legend>
          <div className={`flex flex-wrap gap-2 ${fieldErrors["motifs"] ? "p-2 rounded-lg border border-danger/30 bg-danger-soft" : ""}`}>
            {MOTIFS.map((motif) => (
              <label key={motif} className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
                form.motifs.includes(motif) ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"
              }`}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          <FieldError errors={fieldErrors} field="motifs" />
        </fieldset>

        <div>
          <label htmlFor={`${id}-f6`} className="block text-sm font-medium text-ink-muted mb-1">
            Votre message <span className="font-normal text-ink-subtle">(facultatif)</span>
          </label>
          <textarea id={`${id}-f6`}
            value={form.details}
            onChange={(e) => set("details", e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Décrivez votre situation ou ce que vous souhaitez aborder…"
            className={inputClass(fieldErrors, "details", "resize-none")}
          />
          <FieldError errors={fieldErrors} field="details" />
          <p className="text-xs text-ink-subtle mt-1">
            Ce message n&apos;est lu que par l&apos;équipe qui confie votre demande et par le référent qui vous accompagnera.
          </p>
        </div>
      </div>

      {/* Turnstile */}
      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="text-xs text-ink-subtle mt-1">Vérification anti-robots requise.</p>}
      </div>

      {globalError && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">{globalError}</p>
      )}

      <button type="submit"
        disabled={submitting || !turnstileToken}
        className="w-full bg-brand text-on-brand py-3 rounded-lg font-medium text-sm hover:bg-accent hover:text-brand-text focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>

      <p className="text-xs text-ink-subtle text-center">* Champs obligatoires. Un email de confirmation vous sera envoyé.</p>
    </form>
  );
}
