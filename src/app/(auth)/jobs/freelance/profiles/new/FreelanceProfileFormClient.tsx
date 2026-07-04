"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileInitial {
  id: string;
  title: string;
  domain: string;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  availableFrom: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
}

export default function FreelanceProfileFormClient({
  initial,
  defaultEmail,
}: {
  initial?: ProfileInitial;
  defaultEmail?: string | null;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [title,        setTitle]        = useState(initial?.title        ?? "");
  const [domain,       setDomain]       = useState(initial?.domain       ?? "");
  const [dailyRate,    setDailyRate]    = useState(initial?.dailyRate    ?? "");
  const [hourlyRate,   setHourlyRate]   = useState(initial?.hourlyRate   ?? "");
  const [modality,     setModality]     = useState<"REMOTE" | "ONSITE" | "HYBRID">(initial?.modality ?? "REMOTE");
  const [location,     setLocation]     = useState(initial?.location     ?? "");
  const [availableFrom, setAvailableFrom] = useState(
    initial?.availableFrom ? new Date(initial.availableFrom).toISOString().slice(0, 10) : ""
  );
  const [description,  setDescription]  = useState(initial?.description  ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? defaultEmail ?? "");
  const [contactUrl,   setContactUrl]   = useState(initial?.contactUrl   ?? "");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      title:         title.trim(),
      domain:        domain.trim(),
      dailyRate:     dailyRate.trim()    || null,
      hourlyRate:    hourlyRate.trim()   || null,
      modality,
      location:      location.trim()    || null,
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      description:   description.trim(),
      contactEmail:  contactEmail.trim() || null,
      contactUrl:    contactUrl.trim()   || null,
    };

    try {
      const url    = isEdit ? `/api/jobs/freelance/profiles/${initial!.id}` : "/api/jobs/freelance/profiles";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lors de la publication"); return; }
      router.push(`/jobs/freelance/profiles/${data.id}`);
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
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Titre *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React disponible pour missions"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Domaine / Stack technique *</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            maxLength={150}
            placeholder="Ex: Développement web, Design, Comptabilité..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Modalité *</label>
          <select
            value={modality}
            onChange={(e) => setModality(e.target.value as "REMOTE" | "ONSITE" | "HYBRID")}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          >
            <option value="REMOTE">Full remote</option>
            <option value="ONSITE">Présentiel</option>
            <option value="HYBRID">Hybride</option>
          </select>
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

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">TJM (taux journalier)</label>
          <input
            type="text"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value)}
            maxLength={100}
            placeholder="Ex: 400€, 300-500€, à définir"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Taux horaire</label>
          <input
            type="text"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            maxLength={100}
            placeholder="Ex: 50€, 40-60€"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        {modality !== "REMOTE" && (
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Localisation</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={150}
              placeholder="Ville, région..."
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
            />
          </div>
        )}

        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Présentation *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Présentez vos compétences, expériences et ce que vous proposez..."
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
            placeholder="https://..."
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
          {saving ? "Publication…" : isEdit ? "Enregistrer" : "Publier mon profil freelance"}
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
