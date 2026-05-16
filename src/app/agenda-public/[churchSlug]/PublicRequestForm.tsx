"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  churchSlug: string;
  churchName: string;
  turnstileSiteKey: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"];
const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"];
const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"];
const DAYS = ["Mardi", "Dimanche"];

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  if (!errors[field]) return null;
  return <p className="text-xs text-red-600 mt-1">{errors[field]}</p>;
}

function inputClass(errors: FieldErrors, field: string, extra = "") {
  return `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet ${
    errors[field] ? "border-red-400 bg-red-50" : "border-gray-200"
  } ${extra}`;
}

function RadioGroup({ name, options, value, onChange, errors }: {
  name: string; options: string[]; value: string;
  onChange: (v: string) => void; errors: FieldErrors;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${errors[name] ? "p-2 rounded-lg border border-red-300 bg-red-50" : ""}`}>
      {options.map((opt) => (
        <label key={opt} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
          value === opt ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"
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
    preferredDay: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    function init() {
      if (!widgetRef.current || widgetId.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      widgetId.current = (window as any).turnstile?.render(widgetRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(null),
        "error-callback": () => setTurnstileToken(null),
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).turnstile) { init(); } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true; script.defer = true; script.onload = init;
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) { setGlobalError("Veuillez compléter la vérification CAPTCHA."); return; }
    setSubmitting(true); setGlobalError(null); setFieldErrors({});

    try {
      const res = await fetch("/api/agenda/requests/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchSlug, ...form,
          department: form.department || null,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (widgetId.current) (window as any).turnstile?.reset(widgetId.current);
        setTurnstileToken(null);
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
      <div className="bg-white rounded-xl border border-green-200 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto text-2xl">✓</div>
        <h2 className="text-lg font-semibold text-gray-900">Demande envoyée !</h2>
        <p className="text-sm text-gray-600">
          Votre demande de rendez-vous auprès de <strong>{churchName}</strong> a bien été reçue.
          Un email de confirmation vous a été envoyé. L&apos;équipe pastorale vous contactera prochainement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Coordonnées */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Vos coordonnées</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input type="text" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)}
              className={inputClass(fieldErrors, "lastName")} />
            <FieldError errors={fieldErrors} field="lastName" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
            <input type="text" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
              className={inputClass(fieldErrors, "firstName")} />
            <FieldError errors={fieldErrors} field="firstName" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sexe *</label>
          <RadioGroup name="gender" options={["Homme", "Femme"]} value={form.gender}
            onChange={(v) => set("gender", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="gender" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
          <input type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)}
            className={inputClass(fieldErrors, "phone")} />
          <FieldError errors={fieldErrors} field="phone" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adresse mail *</label>
          <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}
            className={inputClass(fieldErrors, "email")} />
          <FieldError errors={fieldErrors} field="email" />
        </div>
      </div>

      {/* Profil */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Votre profil</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tranche d&apos;âge *</label>
          <RadioGroup name="ageRange" options={AGE_RANGES} value={form.ageRange}
            onChange={(v) => set("ageRange", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="ageRange" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Depuis quand êtes-vous à {churchName} ? *</label>
          <RadioGroup name="membershipDuration" options={DURATIONS} value={form.membershipDuration}
            onChange={(v) => set("membershipDuration", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="membershipDuration" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Êtes-vous STAR ? *</label>
          <RadioGroup name="isStar" options={["Oui", "Non"]} value={form.isStar}
            onChange={(v) => set("isStar", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="isStar" />
        </div>

        {form.isStar === "Oui" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dans quel département servez-vous ?</label>
            <input type="text" value={form.department} onChange={(e) => set("department", e.target.value)}
              placeholder="Ex : Choristes, Accueil, Son…"
              className={inputClass(fieldErrors, "department")} />
            <FieldError errors={fieldErrors} field="department" />
          </div>
        )}
      </div>

      {/* Motif */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Votre demande</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pour quel motif sollicitez-vous un entretien ? * <span className="font-normal text-gray-400">(plusieurs choix possibles)</span>
          </label>
          <div className={`flex flex-wrap gap-2 ${fieldErrors["motifs"] ? "p-2 rounded-lg border border-red-300 bg-red-50" : ""}`}>
            {MOTIFS.map((motif) => (
              <label key={motif} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                form.motifs.includes(motif) ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"
              }`}>
                <input type="checkbox" checked={form.motifs.includes(motif)}
                  onChange={() => toggleMotif(motif)} className="sr-only" />
                {motif}
              </label>
            ))}
          </div>
          <FieldError errors={fieldErrors} field="motifs" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Choix du jour *</label>
          <RadioGroup name="preferredDay" options={DAYS} value={form.preferredDay}
            onChange={(v) => set("preferredDay", v)} errors={fieldErrors} />
          <FieldError errors={fieldErrors} field="preferredDay" />
        </div>
      </div>

      {/* Turnstile */}
      {turnstileSiteKey && (
        <div>
          <div ref={widgetRef} />
          {!turnstileToken && <p className="text-xs text-gray-400 mt-1">Vérification anti-spam requise.</p>}
        </div>
      )}

      {globalError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{globalError}</p>
      )}

      <button type="submit"
        disabled={submitting || (!!turnstileSiteKey && !turnstileToken)}
        className="w-full bg-icc-violet text-white py-3 rounded-xl font-medium text-sm hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>

      <p className="text-xs text-gray-400 text-center">* Champs obligatoires. Un email de confirmation vous sera envoyé.</p>
    </form>
  );
}
