"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  churchSlug: string;
  churchName: string;
  turnstileSiteKey: string;
}

type FieldErrors = Partial<Record<string, string>>;

const DAYS = [
  { value: "lundi", label: "Lundi" },
  { value: "mardi", label: "Mardi" },
  { value: "mercredi", label: "Mercredi" },
  { value: "jeudi", label: "Jeudi" },
  { value: "vendredi", label: "Vendredi" },
  { value: "samedi", label: "Samedi" },
  { value: "dimanche", label: "Dimanche" },
];

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  if (!errors[field]) return null;
  return <p className="text-xs text-red-600 mt-1">{errors[field]}</p>;
}

function inputClass(errors: FieldErrors, field: string) {
  return `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet ${
    errors[field] ? "border-red-400 bg-red-50" : "border-gray-200"
  }`;
}

export default function PublicRequestForm({ churchSlug, churchName, turnstileSiteKey }: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    preferredDays: [] as string[],
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
    if ((window as any).turnstile) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = init;
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      preferredDays: f.preferredDays.includes(day)
        ? f.preferredDays.filter((d) => d !== day)
        : [...f.preferredDays, day],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      setGlobalError("Veuillez compléter la vérification CAPTCHA.");
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/agenda/requests/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchSlug,
          ...form,
          preferredDays: form.preferredDays.join(", ") || null,
          phone: form.phone || null,
          turnstileToken,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Erreurs de validation Zod → afficher par champ
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
        // Reset Turnstile
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Vos coordonnées</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
            <input
              type="text"
              required
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className={inputClass(fieldErrors, "firstName")}
            />
            <FieldError errors={fieldErrors} field="firstName" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              type="text"
              required
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className={inputClass(fieldErrors, "lastName")}
            />
            <FieldError errors={fieldErrors} field="lastName" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass(fieldErrors, "email")}
          />
          <FieldError errors={fieldErrors} field="email" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass(fieldErrors, "phone")}
          />
          <FieldError errors={fieldErrors} field="phone" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Votre demande</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Objet *</label>
          <input
            type="text"
            required
            placeholder="Ex : Counseling, accompagnement spirituel…"
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
            className={inputClass(fieldErrors, "subject")}
          />
          <FieldError errors={fieldErrors} field="subject" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message * <span className="text-gray-400 font-normal">(10 caractères minimum)</span>
          </label>
          <textarea
            required
            rows={4}
            placeholder="Décrivez brièvement l'objet de votre demande…"
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            className={`${inputClass(fieldErrors, "message")} resize-none`}
          />
          <FieldError errors={fieldErrors} field="message" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Jours préférés</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  form.preferredDays.includes(d.value)
                    ? "bg-icc-violet text-white border-icc-violet"
                    : "border-gray-200 text-gray-600 hover:border-icc-violet"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Turnstile */}
      {turnstileSiteKey && (
        <div>
          <div ref={widgetRef} />
          {!turnstileToken && (
            <p className="text-xs text-gray-400 mt-1">Vérification anti-spam requise.</p>
          )}
        </div>
      )}

      {globalError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{globalError}</p>
      )}

      <button
        type="submit"
        disabled={submitting || (!!turnstileSiteKey && !turnstileToken)}
        className="w-full bg-icc-violet text-white py-3 rounded-xl font-medium text-sm hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>

      <p className="text-xs text-gray-400 text-center">
        * Champs obligatoires. Un email de confirmation vous sera envoyé.
      </p>
    </form>
  );
}
