"use client";

import { SubmitEvent, useEffect, useId, useRef, useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

interface AddressSuggestion {
  label: string;
  context: string;
}

interface FamilySuggestion {
  familyId: number | null;
  familyName: string | null;
  loading: boolean;
  searched: boolean;
}

function useFamilySuggestion(churchId: string) {
  const [state, setState] = useState<FamilySuggestion>({ familyId: null, familyName: null, loading: false, searched: false });

  async function lookup(address: string) {
    if (!address) { setState({ familyId: null, familyName: null, loading: false, searched: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(
        `/api/integration/families/suggest?address=${encodeURIComponent(address)}&churchId=${encodeURIComponent(churchId)}`
      );
      if (!res.ok) { setState({ familyId: null, familyName: null, loading: false, searched: true }); return; }
      const json = await res.json();
      setState({ familyId: json.familyId ?? null, familyName: json.familyName ?? null, loading: false, searched: true });
    } catch {
      setState({ familyId: null, familyName: null, loading: false, searched: true });
    }
  }

  function clear() { setState({ familyId: null, familyName: null, loading: false, searched: false }); }

  return { ...state, lookup, clear };
}

function useAddressSuggestions(query: string) {
  const [fetched, setFetched] = useState<AddressSuggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Liste DERIVEE de la saisie : en dessous du seuil on n'affiche rien, sans reinitialiser
  // l'etat depuis l'effet (rendus en cascade).
  const tooShort = query.trim().length < 3;
  const suggestions = tooShort ? [] : fetched;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (tooShort) return;

    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`
        );
        if (!res.ok) return;
        const json = await res.json();
        setFetched(
          (json.features ?? []).map((f: { properties: { label: string; context: string } }) => ({
            label: f.properties.label,
            context: f.properties.context,
          }))
        );
      } catch { /* silently ignore */ }
    }, 300);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, tooShort]);

  return { suggestions, clear: () => setFetched([]) };
}

interface Props {
  readonly churchId: string;
  readonly churchName: string;
  /** Case « soin pastoral » — affichée seulement si `care` est actif (spec 052). */
  readonly showPastoralCare: boolean;
  /** Clé publique Turnstile lue côté serveur (spec 030). */
  readonly turnstileSiteKey: string;
}

type FieldErrors = Partial<Record<string, string>>;

const AGE_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "YOUTH", label: "Jeune (−18 ans)" },
  { value: "YOUNG_ADULT", label: "Jeune adulte (18–30 ans)" },
  { value: "ADULT", label: "Adulte (30–60 ans)" },
  { value: "SENIOR", label: "Senior (60+ ans)" },
];

const CHURCH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "VISITOR", label: "Visiteur — je découvre" },
  { value: "REGULAR", label: "Régulier — je viens souvent" },
  { value: "ENGAGED", label: "Engagé — je sers" },
];


function FieldError({ errors, field }: { readonly errors: FieldErrors; readonly field: string }) {
  if (!errors[field]) return null;
  return <p className="text-xs text-danger mt-1">{errors[field]}</p>;
}

function inputClass(errors: FieldErrors, field: string, extra = "") {
  return `w-full border-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-brand ${
    errors[field] ? "border-danger bg-danger-soft" : "border-control-line"
  } ${extra}`;
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
  errors,
}: {
  readonly name: string;
  readonly options: { value: string; label: string }[];
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly errors: FieldErrors;
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${errors[name] ? "p-2 rounded-lg border border-danger/30 bg-danger-soft" : ""}`}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-brand text-on-brand border-brand"
              : "border-line text-ink-muted hover:border-brand"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

interface SuccessData {
  suggestedFamilyName?: string | null;
  pastoralCare: boolean;
  contactLater: boolean;
}

// Pas d'option « aucun contact » : une personne qui ne souhaite pas être contactée ne
// remplit simplement pas le formulaire (spec 051).
const CONTACT_CONSENT_OPTIONS = [
  { value: "NOW", label: "Être contacté·e maintenant" },
  { value: "LATER", label: "Être recontacté·e plus tard" },
];

export default function JoinForm({ churchId, churchName, showPastoralCare, turnstileSiteKey }: Props) {
  const uid = useId();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    ageRange: "",
    churchStatus: "VISITOR",
    contactConsent: "NOW",
    pastoralCareRequested: false,
    pastoralMessage: "",
    salvationCall: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const { suggestions: addressSuggestions, clear: clearSuggestions } = useAddressSuggestions(form.address);
  const familySuggestion = useFamilySuggestion(churchId);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      setGlobalError("Merci de compléter la vérification anti-robots ci-dessus.");
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/integration/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          address: form.address || undefined,
          pastoralMessage: form.pastoralMessage || undefined,
          churchId,
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
        setSuccess({
          suggestedFamilyName: json.suggestedFamilyName ?? null,
          pastoralCare: form.pastoralCareRequested,
          contactLater: form.contactConsent === "LATER",
        });
      }
    } catch {
      setGlobalError("Une erreur réseau est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="bg-surface rounded-xl border border-success/30 p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto text-3xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-ink">Demande envoyée !</h2>
        <p className="text-sm text-ink-muted">
          Ta demande pour rejoindre une famille à <strong>{churchName}</strong> a bien été reçue.{" "}
          {success.contactLater
            ? "Comme tu l'as souhaité, notre équipe conserve tes coordonnées et te recontactera plus tard."
            : "Notre équipe va prendre contact avec toi très prochainement."}
        </p>
        {success.suggestedFamilyName && (
          <div className="bg-brand-soft border border-brand/30 rounded-lg px-4 py-3 text-sm text-left">
            <p className="font-medium text-brand-text mb-0.5">Famille suggérée</p>
            <p className="text-ink-muted">{success.suggestedFamilyName}</p>
            <p className="text-xs text-ink-muted mt-1">
              L&apos;équipe confirmera cette affectation lors du suivi.
            </p>
          </div>
        )}
        {success.pastoralCare && (
          <div className="bg-warning-soft border border-warning/30 rounded-lg px-4 py-3 text-sm text-left">
            <p className="text-warning">
              Ta demande de soin pastoral a également été enregistrée. Un pasteur te contactera
              séparément.
            </p>
          </div>
        )}
        {form.email && (
          <p className="text-xs text-ink-subtle">Un email de confirmation a été envoyé à {form.email}.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identité */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Qui es-tu ?</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-firstName`} className="block text-sm font-medium text-ink-muted mb-1">
              Prénom <span className="text-danger">*</span>
            </label>
            <input
              id={`${uid}-firstName`}
              type="text"
              required
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className={inputClass(fieldErrors, "firstName")}
            />
            <FieldError errors={fieldErrors} field="firstName" />
          </div>
          <div>
            <label htmlFor={`${uid}-lastName`} className="block text-sm font-medium text-ink-muted mb-1">
              Nom <span className="text-danger">*</span>
            </label>
            <input
              id={`${uid}-lastName`}
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
          <label htmlFor={`${uid}-phone`} className="block text-sm font-medium text-ink-muted mb-1">
            Téléphone <span className="text-danger">*</span>
          </label>
          <input
            id={`${uid}-phone`}
            type="tel"
            required
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="Ex : 06 12 34 56 78"
            className={inputClass(fieldErrors, "phone")}
          />
          <FieldError errors={fieldErrors} field="phone" />
        </div>

        <div>
          <label htmlFor={`${uid}-email`} className="block text-sm font-medium text-ink-muted mb-1">
            Email <span className="text-ink-subtle text-xs">(pour recevoir une confirmation)</span>
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="prenom@exemple.fr"
            className={inputClass(fieldErrors, "email")}
          />
          <FieldError errors={fieldErrors} field="email" />
        </div>
      </div>

      {/* Trouve ta famille */}
      <div className={`rounded-xl border-2 p-4 sm:p-6 space-y-4 transition-colors ${familySuggestion.familyName ? "border-brand/30 bg-brand-soft" : "border-line bg-surface"}`}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-brand-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Trouve ta famille</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Saisis ton adresse pour qu&apos;on t&apos;oriente vers la famille la plus proche de chez toi.
            </p>
          </div>
        </div>

        <div className="relative">
          <label htmlFor={`${uid}-address`} className="block text-sm font-medium text-ink-muted mb-1">Ton adresse</label>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id={`${uid}-address`}
              type="text"
              value={form.address}
              onChange={(e) => { set("address", e.target.value); familySuggestion.clear(); }}
              onBlur={() => setTimeout(clearSuggestions, 150)}
              placeholder="Commence à taper ton adresse…"
              className={`${inputClass(fieldErrors, "address")} pl-9`}
              autoComplete="off"
            />
          </div>
          <FieldError errors={fieldErrors} field="address" />

          {/* Indice d'utilisation — visible tant que l'utilisateur n'a pas sélectionné */}
          {!familySuggestion.searched && !familySuggestion.loading && (
            <p className="text-xs text-ink-subtle mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {form.address.length === 0
                ? "Tape ton adresse puis sélectionne une suggestion."
                : "Sélectionne une suggestion dans la liste."}
            </p>
          )}

          {addressSuggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-line rounded-lg shadow-float overflow-y-auto max-h-48">
              {addressSuggestions.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      set("address", s.label);
                      clearSuggestions();
                      void familySuggestion.lookup(s.label);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-brand-soft hover:text-brand-text transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 text-ink-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      <span className="font-medium">{s.label.split(",")[0]}</span>
                      <span className="text-ink-subtle text-xs ml-1">{s.label.split(",").slice(1).join(",")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Résultat famille */}
        {familySuggestion.loading && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            Recherche de ta famille en cours…
          </div>
        )}
        {!familySuggestion.loading && familySuggestion.familyName && (
          <div className="flex items-center gap-3 bg-surface border border-brand/30 rounded-xl px-4 py-3.5 shadow-card min-h-[64px]">
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-on-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-brand-text font-medium uppercase tracking-wide">Ta famille</p>
              <p className="text-base font-bold text-ink truncate">{familySuggestion.familyName}</p>
            </div>
          </div>
        )}
        {!familySuggestion.loading && familySuggestion.searched && familySuggestion.familyName === null && (
          <div className="flex items-center gap-2 text-xs text-ink-muted bg-surface-sunken border border-line rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-ink-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Aucune famille trouvée pour ce secteur — l&apos;équipe d&apos;intégration te contactera pour t&apos;orienter.
          </div>
        )}
      </div>

      {/* Profil */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">Ton profil</h2>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Tranche d&apos;âge <span className="text-danger">*</span>
          </legend>
          <RadioGroup
            name="ageRange"
            options={AGE_RANGE_OPTIONS}
            value={form.ageRange}
            onChange={(v) => set("ageRange", v)}
            errors={fieldErrors}
          />
          <FieldError errors={fieldErrors} field="ageRange" />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Quelle est ta situation à l&apos;église ? <span className="text-danger">*</span>
          </legend>
          <RadioGroup
            name="churchStatus"
            options={CHURCH_STATUS_OPTIONS}
            value={form.churchStatus}
            onChange={(v) => set("churchStatus", v)}
            errors={fieldErrors}
          />
          <FieldError errors={fieldErrors} field="churchStatus" />
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="block text-sm font-medium text-ink-muted mb-2">
            Quand souhaites-tu être contacté·e ? <span className="text-danger">*</span>
          </legend>
          <RadioGroup
            name="contactConsent"
            options={CONTACT_CONSENT_OPTIONS}
            value={form.contactConsent}
            onChange={(v) => set("contactConsent", v)}
            errors={fieldErrors}
          />
          <FieldError errors={fieldErrors} field="contactConsent" />
        </fieldset>
      </div>

      {/* Appel au salut */}
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-3">
        <h2 className="text-base font-semibold text-ink">Appel au salut</h2>
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="mt-0.5">
            <input
              type="checkbox"
              checked={form.salvationCall}
              onChange={(e) => set("salvationCall", e.target.checked)}
              className="sr-only"
            />
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                form.salvationCall
                  ? "bg-brand border-brand"
                  : "border-control-line group-hover:border-brand"
              }`}
            >
              {form.salvationCall && (
                <svg className="w-3 h-3 text-on-brand" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-ink-muted">
            J&apos;ai fait l&apos;appel au salut lors du culte
          </span>
        </label>
      </div>

      {/* Soin pastoral — case affichée seulement si `care` est actif (spec 052) */}
      {showPastoralCare && (
      <div className="bg-surface rounded-xl border border-line p-4 sm:p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Soins pastoraux</h2>
          <p className="text-sm text-ink-muted mt-1">
            Tu traverses une épreuve spirituelle, émotionnelle ou relationnelle&nbsp;? Tu portes des blessures
            du passé, une dépression ou des difficultés familiales dont tu voudrais te libérer&nbsp;?
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="mt-0.5">
            <input
              type="checkbox"
              checked={form.pastoralCareRequested}
              onChange={(e) => set("pastoralCareRequested", e.target.checked)}
              className="sr-only"
            />
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                form.pastoralCareRequested
                  ? "bg-brand border-brand"
                  : "border-control-line group-hover:border-brand"
              }`}
            >
              {form.pastoralCareRequested && (
                <svg className="w-3 h-3 text-on-brand" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-ink-muted">
            Oui, je souhaite être accompagné par l&apos;équipe des soins pastoraux
          </span>
        </label>

        {form.pastoralCareRequested && (
          <div>
            <label htmlFor={`${uid}-pastoral-message`} className="block text-sm font-medium text-ink-muted mb-1">
              Précise ta demande <span className="text-ink-subtle text-xs">(facultatif)</span>
            </label>
            <textarea
              id={`${uid}-pastoral-message`}
              value={form.pastoralMessage}
              onChange={(e) => set("pastoralMessage", e.target.value)}
              rows={3}
              placeholder="Décris brièvement ce pour quoi tu souhaites être accompagné…"
              className={inputClass(fieldErrors, "pastoralMessage", "resize-none")}
            />
            <FieldError errors={fieldErrors} field="pastoralMessage" />
          </div>
        )}
      </div>
      )}

      <div>
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetSignal={turnstileReset} />
        {!turnstileToken && <p className="text-xs text-ink-subtle mt-1">Vérification anti-robots requise.</p>}
      </div>

      {globalError && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">
          {globalError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !turnstileToken}
        className="w-full bg-brand text-on-brand py-3 rounded-lg font-medium text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>

      <p className="text-xs text-ink-subtle text-center">
        * Champs obligatoires. Tes informations sont utilisées uniquement dans le cadre de ton
        intégration.
      </p>
    </form>
  );
}
