"use client";

import { useState, useEffect, useRef } from "react";

type Church = { id: string; name: string };
type MemberResult = { id: string; firstName: string; lastName: string };

type Step = "choice" | "existing" | "new" | "contact" | "pending";

export default function NoAccessClient({
  churches,
}: {
  churches: Church[];
}) {
  const [step, setStep] = useState<Step>("choice");
  const [churchId, setChurchId] = useState(churches[0]?.id ?? "");

  // Existing STAR flow
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberResult[]>([]);
  const [selected, setSelected] = useState<MemberResult | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New STAR flow
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "existing" || query.length < 2) {
      setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/members/search?q=${encodeURIComponent(query)}&churchId=${churchId}`
        );
        const json = await res.json();
        setResults(json.data ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, churchId, step]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body =
        step === "existing"
          ? { type: "existing", memberId: selected!.id, churchId }
          : { type: "new", firstName, lastName, phone: phone || undefined, churchId };

      const res = await fetch("/api/member-link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de la soumission");
      setStep("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "pending") {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Demande envoyée</h2>
        <p className="text-gray-600 text-sm">
          Un administrateur va examiner votre demande. Vous recevrez une confirmation dès qu&apos;elle sera traitée.
        </p>
        <p className="text-gray-400 text-xs mt-4">
          Vous pouvez fermer cette page ou vous déconnecter.
        </p>
      </div>
    );
  }

  if (step === "contact") {
    return (
      <div className="text-center">
        <p className="text-gray-600 mb-6">
          Contactez un <strong>administrateur</strong> ou le <strong>secrétariat</strong> pour
          qu&apos;ils configurent votre accès.
        </p>
        <button
          onClick={() => setStep("choice")}
          className="text-sm text-icc-violet hover:underline"
        >
          ← Retour
        </button>
      </div>
    );
  }

  if (step === "choice") {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setStep("existing")}
          className="w-full px-4 py-3 text-sm font-medium text-left text-gray-900 bg-gray-50 border-2 border-gray-200 rounded-lg hover:border-icc-violet hover:bg-icc-violet/5 transition-colors"
        >
          <span className="font-semibold text-icc-violet">Je suis déjà un STAR</span>
          <p className="text-xs text-gray-500 mt-0.5">Je suis déjà enregistré comme serviteur dans l&apos;église</p>
        </button>
        <button
          onClick={() => setStep("new")}
          className="w-full px-4 py-3 text-sm font-medium text-left text-gray-900 bg-gray-50 border-2 border-gray-200 rounded-lg hover:border-icc-violet hover:bg-icc-violet/5 transition-colors"
        >
          <span className="font-semibold text-icc-violet">Je ne suis pas encore un STAR</span>
          <p className="text-xs text-gray-500 mt-0.5">Je veux créer ma fiche et demander un accès</p>
        </button>
        <button
          onClick={() => setStep("contact")}
          className="w-full px-4 py-3 text-sm text-gray-500 bg-gray-50 border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
        >
          Contacter un administrateur
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sélecteur d'église */}
      {churches.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Église</label>
          <select
            value={churchId}
            onChange={(e) => { setChurchId(e.target.value); setSelected(null); setQuery(""); }}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
          >
            {churches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {step === "existing" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Rechercher ma fiche STAR
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Prénom ou nom..."
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
            {searching && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
            {results.length > 0 && !selected && (
              <ul className="mt-1 border-2 border-gray-200 rounded-lg overflow-hidden">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => { setSelected(m); setQuery(`${m.firstName} ${m.lastName}`); setResults([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-icc-violet/5 transition-colors"
                    >
                      {m.firstName} {m.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.length >= 2 && !searching && results.length === 0 && !selected && (
              <p className="text-xs text-gray-400 mt-1">Aucun STAR trouvé pour cette recherche</p>
            )}
          </div>
        </>
      )}

      {step === "new" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone (optionnel)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
        </>
      )}

      {error && <p className="text-sm text-icc-rouge">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => setStep("choice")}
          className="px-4 py-2 text-sm text-gray-600 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Retour
        </button>
        <button
          onClick={submit}
          disabled={
            submitting ||
            (step === "existing" && !selected) ||
            (step === "new" && (!firstName.trim() || !lastName.trim()))
          }
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Envoi..." : "Envoyer la demande"}
        </button>
      </div>
    </div>
  );
}
