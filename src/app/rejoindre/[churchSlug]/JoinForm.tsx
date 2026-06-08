"use client";

import { useState, useEffect, useRef } from "react";

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
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) { setSuggestions([]); return; }

    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`
        );
        if (!res.ok) return;
        const json = await res.json();
        setSuggestions(
          (json.features ?? []).map((f: { properties: { label: string; context: string } }) => ({
            label: f.properties.label,
            context: f.properties.context,
          }))
        );
      } catch { /* silently ignore */ }
    }, 300);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return { suggestions, clear: () => setSuggestions([]) };
}

interface Props {
  churchId: string;
  churchName: string;
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


function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  if (!errors[field]) return null;
  return <p className="text-xs text-red-600 mt-1">{errors[field]}</p>;
}

function inputClass(errors: FieldErrors, field: string, extra = "") {
  return `w-full border-2 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet ${
    errors[field] ? "border-red-500 bg-red-50" : "border-gray-300"
  } ${extra}`;
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
  errors,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  errors: FieldErrors;
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${errors[name] ? "p-2 rounded-lg border border-red-300 bg-red-50" : ""}`}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-center gap-2 px-3 py-2.5 md:py-1.5 min-h-[44px] md:min-h-0 rounded-full border text-sm cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-icc-violet text-white border-icc-violet"
              : "border-gray-200 text-gray-700 hover:border-icc-violet"
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
}

export default function JoinForm({ churchId, churchName }: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    ageRange: "",
    churchStatus: "VISITOR",
    pastoralCareRequested: false,
    pastoralMessage: "",
    salvationCall: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { suggestions: addressSuggestions, clear: clearSuggestions } = useAddressSuggestions(form.address);
  const familySuggestion = useFamilySuggestion(churchId);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      } else {
        setSuccess({
          suggestedFamilyName: json.suggestedFamilyName ?? null,
          pastoralCare: form.pastoralCareRequested,
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
      <div className="bg-white rounded-xl border border-green-200 p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto text-3xl">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Demande envoyée !</h2>
        <p className="text-sm text-gray-600">
          Ta demande pour rejoindre une famille à <strong>{churchName}</strong> a bien été reçue. Notre équipe
          va prendre contact avec toi très prochainement.
        </p>
        {success.suggestedFamilyName && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-sm text-left">
            <p className="font-medium text-icc-violet mb-0.5">Famille suggérée</p>
            <p className="text-gray-700">{success.suggestedFamilyName}</p>
            <p className="text-xs text-gray-500 mt-1">
              L&apos;équipe confirmera cette affectation lors du suivi.
            </p>
          </div>
        )}
        {success.pastoralCare && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-left">
            <p className="text-amber-800">
              Ta demande de soin pastoral a également été enregistrée. Un pasteur te contactera
              séparément.
            </p>
          </div>
        )}
        {form.email && (
          <p className="text-xs text-gray-400">Un email de confirmation a été envoyé à {form.email}.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identité */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Qui es-tu ?</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prénom <span className="text-red-500">*</span>
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom <span className="text-red-500">*</span>
            </label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Téléphone <span className="text-red-500">*</span>
          </label>
          <input
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-gray-400 text-xs">(pour recevoir une confirmation)</span>
          </label>
          <input
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
      <div className={`rounded-xl border-2 p-4 sm:p-6 space-y-4 transition-colors ${familySuggestion.familyName ? "border-icc-violet/30 bg-icc-violet/5" : "border-gray-200 bg-white"}`}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-icc-violet/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-icc-violet" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Trouve ta famille</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Saisis ton adresse pour qu&apos;on t&apos;oriente vers la famille la plus proche de chez toi.
            </p>
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ton adresse</label>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
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
            <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {form.address.length === 0
                ? "Tape ton adresse puis sélectionne une suggestion."
                : "Sélectionne une suggestion dans la liste."}
            </p>
          )}

          {addressSuggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-48">
              {addressSuggestions.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      set("address", s.label);
                      clearSuggestions();
                      familySuggestion.lookup(s.label);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-icc-violet/5 hover:text-icc-violet transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      <span className="font-medium">{s.label.split(",")[0]}</span>
                      <span className="text-gray-400 text-xs ml-1">{s.label.split(",").slice(1).join(",")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Résultat famille */}
        {familySuggestion.loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block w-4 h-4 border-2 border-icc-violet border-t-transparent rounded-full animate-spin shrink-0" />
            Recherche de ta famille en cours…
          </div>
        )}
        {!familySuggestion.loading && familySuggestion.familyName && (
          <div className="flex items-center gap-3 bg-white border border-icc-violet/30 rounded-xl px-4 py-3.5 shadow-sm min-h-[64px]">
            <div className="w-10 h-10 rounded-full bg-icc-violet flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-icc-violet font-medium uppercase tracking-wide">Ta famille</p>
              <p className="text-base font-bold text-gray-900 truncate">{familySuggestion.familyName}</p>
            </div>
          </div>
        )}
        {!familySuggestion.loading && familySuggestion.searched && familySuggestion.familyName === null && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Aucune famille trouvée pour ce secteur — l&apos;équipe d&apos;intégration te contactera pour t&apos;orienter.
          </div>
        )}
      </div>

      {/* Profil */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Ton profil</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tranche d&apos;âge <span className="text-red-500">*</span>
          </label>
          <RadioGroup
            name="ageRange"
            options={AGE_RANGE_OPTIONS}
            value={form.ageRange}
            onChange={(v) => set("ageRange", v)}
            errors={fieldErrors}
          />
          <FieldError errors={fieldErrors} field="ageRange" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quelle est ta situation à l&apos;église ? <span className="text-red-500">*</span>
          </label>
          <RadioGroup
            name="churchStatus"
            options={CHURCH_STATUS_OPTIONS}
            value={form.churchStatus}
            onChange={(v) => set("churchStatus", v)}
            errors={fieldErrors}
          />
          <FieldError errors={fieldErrors} field="churchStatus" />
        </div>
      </div>

      {/* Appel au salut */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Appel au salut</h2>
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
                  ? "bg-icc-violet border-icc-violet"
                  : "border-gray-300 group-hover:border-icc-violet"
              }`}
            >
              {form.salvationCall && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-gray-700">
            J&apos;ai fait l&apos;appel au salut lors du culte
          </span>
        </label>
      </div>

      {/* Soin pastoral */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Soins pastoraux</h2>
          <p className="text-sm text-gray-500 mt-1">
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
                  ? "bg-icc-violet border-icc-violet"
                  : "border-gray-300 group-hover:border-icc-violet"
              }`}
            >
              {form.pastoralCareRequested && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-gray-700">
            Oui, je souhaite être accompagné par un pasteur
          </span>
        </label>

        {form.pastoralCareRequested && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Précise ta demande <span className="text-gray-400 text-xs">(facultatif)</span>
            </label>
            <textarea
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

      {globalError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {globalError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-icc-violet text-white py-3 rounded-lg font-medium text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-icc-violet disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>

      <p className="text-xs text-gray-400 text-center">
        * Champs obligatoires. Tes informations sont utilisées uniquement dans le cadre de ton
        intégration.
      </p>
    </form>
  );
}
