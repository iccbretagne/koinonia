"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SeekerInitial {
  id: string;
  title: string;
  wantEmploi: boolean;
  wantStage: boolean;
  wantAlternance: boolean;
  sector: string | null;
  location: string | null;
  remote: boolean;
  availableFrom: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
}

export default function SeekerFormClient({
  initial,
  defaultEmail,
}: {
  initial?: SeekerInitial;
  defaultEmail?: string | null;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [title,          setTitle]          = useState(initial?.title          ?? "");
  const [wantEmploi,     setWantEmploi]     = useState(initial?.wantEmploi     ?? false);
  const [wantStage,      setWantStage]      = useState(initial?.wantStage      ?? false);
  const [wantAlternance, setWantAlternance] = useState(initial?.wantAlternance ?? false);
  const [sector,         setSector]         = useState(initial?.sector         ?? "");
  const [location,       setLocation]       = useState(initial?.location       ?? "");
  const [remote,         setRemote]         = useState(initial?.remote         ?? false);
  const [availableFrom,  setAvailableFrom]  = useState(
    initial?.availableFrom ? new Date(initial.availableFrom).toISOString().slice(0, 10) : ""
  );
  const [description,    setDescription]    = useState(initial?.description    ?? "");
  const [contactEmail,   setContactEmail]   = useState(initial?.contactEmail   ?? defaultEmail ?? "");
  const [contactUrl,     setContactUrl]     = useState(initial?.contactUrl     ?? "");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const noContractSelected = !wantEmploi && !wantStage && !wantAlternance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (noContractSelected) {
      setError("Sélectionnez au moins un type de contrat.");
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      title:          title.trim(),
      wantEmploi,
      wantStage,
      wantAlternance,
      sector:         sector.trim()       || null,
      location:       location.trim()     || null,
      remote,
      availableFrom:  availableFrom ? new Date(availableFrom).toISOString() : null,
      description:    description.trim(),
      contactEmail:   contactEmail.trim() || null,
      contactUrl:     contactUrl.trim()   || null,
    };

    try {
      const url    = isEdit ? `/api/jobs/seekers/${initial!.id}` : "/api/jobs/seekers";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lors de la publication"); return; }
      router.push(`/jobs/seekers/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border-2 border-gray-200 p-6 space-y-5">
      {error && (
        <div className="bg-icc-rouge/10 text-icc-rouge text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Titre de la recherche *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React en recherche de CDI"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Type(s) de contrat recherché(s) *
          </label>
          <div className="flex gap-4 flex-wrap">
            {[
              { label: "Emploi (CDI/CDD)", key: "wantEmploi",     value: wantEmploi,     set: setWantEmploi },
              { label: "Stage",            key: "wantStage",      value: wantStage,      set: setWantStage },
              { label: "Alternance",       key: "wantAlternance", value: wantAlternance, set: setWantAlternance },
            ].map(({ label, key, value, set }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 rounded border-2 border-gray-300 accent-icc-violet"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
          {noContractSelected && (
            <p className="text-xs text-icc-rouge mt-1">Sélectionnez au moins un type de contrat.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Secteur / Domaine</label>
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            maxLength={150}
            placeholder="Ex: Informatique, Finance, RH..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Localisation souhaitée</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={150}
            placeholder="Ville, région..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="remote"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            className="w-4 h-4 rounded border-2 border-gray-300 accent-icc-violet"
          />
          <label htmlFor="remote" className="text-sm font-semibold text-gray-700 cursor-pointer">
            Ouvert au télétravail
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Disponible à partir du</label>
          <input
            type="date"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Présentation *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Présentez votre profil, vos compétences, vos expériences et ce que vous recherchez..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email de contact</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="votre@email.fr"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">LinkedIn / Portfolio</label>
          <input
            type="url"
            value={contactUrl}
            onChange={(e) => setContactUrl(e.target.value)}
            placeholder="https://linkedin.com/in/..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-icc-violet text-white text-sm font-semibold rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Publication…" : isEdit ? "Enregistrer" : "Publier mon profil"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border-2 border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
