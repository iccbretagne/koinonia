"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

interface MissionInitial {
  id: string;
  title: string;
  domain: string;
  duration: string | null;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: "REMOTE" | "ONSITE" | "HYBRID";
  location: string | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
}

export default function MissionFormClient({
  initial,
  defaultEmail,
}: {
  readonly initial?: MissionInitial;
  readonly defaultEmail?: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const isEdit = !!initial;

  const [title,        setTitle]        = useState(initial?.title        ?? "");
  const [domain,       setDomain]       = useState(initial?.domain       ?? "");
  const [duration,     setDuration]     = useState(initial?.duration     ?? "");
  const [dailyRate,    setDailyRate]    = useState(initial?.dailyRate    ?? "");
  const [hourlyRate,   setHourlyRate]   = useState(initial?.hourlyRate   ?? "");
  const [modality,     setModality]     = useState<"REMOTE" | "ONSITE" | "HYBRID">(initial?.modality ?? "REMOTE");
  const [location,     setLocation]     = useState(initial?.location     ?? "");
  const [description,  setDescription]  = useState(initial?.description  ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? defaultEmail ?? "");
  const [contactUrl,   setContactUrl]   = useState(initial?.contactUrl   ?? "");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      title:        title.trim(),
      domain:       domain.trim(),
      duration:     duration.trim()     || null,
      dailyRate:    dailyRate.trim()    || null,
      hourlyRate:   hourlyRate.trim()   || null,
      modality,
      location:     location.trim()    || null,
      description:  description.trim(),
      contactEmail: contactEmail.trim() || null,
      contactUrl:   contactUrl.trim()   || null,
    };

    try {
      const url    = isEdit ? `/api/jobs/freelance/missions/${initial!.id}` : "/api/jobs/freelance/missions";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lors de la publication"); return; }
      router.push(`/jobs/freelance/missions/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  let submitLabel = "Publier la mission";
  if (saving) submitLabel = "Publication…";
  else if (isEdit) submitLabel = "Enregistrer";

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-6 space-y-5">
      {error && (
        <div className="bg-danger-soft text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor={`${id}-f1`} className="block text-sm font-semibold text-ink-muted mb-1.5">Titre de la mission *</label>
          <input id={`${id}-f1`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React pour refonte site web"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div className="col-span-2">
          <label htmlFor={`${id}-f2`} className="block text-sm font-semibold text-ink-muted mb-1.5">Domaine / Stack technique *</label>
          <input id={`${id}-f2`}
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            maxLength={150}
            placeholder="Ex: Développement web, Design, Comptabilité..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${id}-f3`} className="block text-sm font-semibold text-ink-muted mb-1.5">Durée estimée</label>
          <input id={`${id}-f3`}
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            maxLength={100}
            placeholder="Ex: 3 mois, 6 mois, indéterminé..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${id}-f4`} className="block text-sm font-semibold text-ink-muted mb-1.5">Modalité *</label>
          <select id={`${id}-f4`}
            value={modality}
            onChange={(e) => setModality(e.target.value as "REMOTE" | "ONSITE" | "HYBRID")}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          >
            <option value="REMOTE">Full remote</option>
            <option value="ONSITE">Présentiel</option>
            <option value="HYBRID">Hybride</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-f5`} className="block text-sm font-semibold text-ink-muted mb-1.5">TJM (taux journalier)</label>
          <input id={`${id}-f5`}
            type="text"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value)}
            maxLength={100}
            placeholder="Ex: 400€, 300-500€, à définir"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${id}-f6`} className="block text-sm font-semibold text-ink-muted mb-1.5">Taux horaire</label>
          <input id={`${id}-f6`}
            type="text"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            maxLength={100}
            placeholder="Ex: 50€, 40-60€"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        {modality !== "REMOTE" && (
          <div className="col-span-2">
            <label htmlFor={`${id}-f7`} className="block text-sm font-semibold text-ink-muted mb-1.5">Localisation</label>
            <input id={`${id}-f7`}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={150}
              placeholder="Ville, région..."
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
            />
          </div>
        )}

        <div className="col-span-2">
          <label htmlFor={`${id}-f8`} className="block text-sm font-semibold text-ink-muted mb-1.5">Description de la mission *</label>
          <textarea id={`${id}-f8`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Décrivez la mission, le contexte, le profil recherché, les livrables attendus..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand resize-y"
          />
        </div>

        <div>
          <label htmlFor={`${id}-f9`} className="block text-sm font-semibold text-ink-muted mb-1.5">Email de contact</label>
          <input id={`${id}-f9`}
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="votre@email.fr"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${id}-f10`} className="block text-sm font-semibold text-ink-muted mb-1.5">Lien (site, LinkedIn…)</label>
          <input id={`${id}-f10`}
            type="url"
            value={contactUrl}
            onChange={(e) => setContactUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-brand text-on-brand text-sm font-semibold rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-line text-ink-muted text-sm font-semibold rounded-lg hover:bg-surface-sunken transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
