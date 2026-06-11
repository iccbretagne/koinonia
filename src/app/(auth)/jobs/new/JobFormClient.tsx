"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

export default function JobFormClient({ initial }: { initial?: {
  id: string;
  title: string;
  type: JobType;
  company: string;
  location: string | null;
  description: string;
  duration: string | null;
  deadline: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
}}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [title,        setTitle]        = useState(initial?.title        ?? "");
  const [type,         setType]         = useState<JobType>(initial?.type ?? "EMPLOI");
  const [company,      setCompany]      = useState(initial?.company      ?? "");
  const [location,     setLocation]     = useState(initial?.location     ?? "");
  const [description,  setDescription]  = useState(initial?.description  ?? "");
  const [duration,     setDuration]     = useState(initial?.duration     ?? "");
  const [deadline,     setDeadline]     = useState(
    initial?.deadline ? new Date(initial.deadline).toISOString().slice(0, 10) : ""
  );
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [contactUrl,   setContactUrl]   = useState(initial?.contactUrl   ?? "");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      title:        title.trim(),
      type,
      company:      company.trim(),
      location:     location.trim() || null,
      description:  description.trim(),
      duration:     duration.trim() || null,
      deadline:     deadline ? new Date(deadline).toISOString() : null,
      contactEmail: contactEmail.trim() || null,
      contactUrl:   contactUrl.trim() || null,
    };

    try {
      const url    = isEdit ? `/api/jobs/${initial!.id}` : "/api/jobs";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lors de la publication"); return; }
      router.push(`/jobs/${data.id}`);
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
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Intitulé du poste *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React, Comptable..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type *</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as JobType)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          >
            <option value="EMPLOI">Emploi</option>
            <option value="STAGE">Stage</option>
            <option value="ALTERNANCE">Alternance</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Entreprise / Organisme *</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            maxLength={150}
            placeholder="Nom de l'entreprise"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Lieu</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={150}
            placeholder="Ville, région ou télétravail"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Durée / Rythme</label>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            maxLength={100}
            placeholder="Ex: 6 mois, CDI, 2 ans..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Décrivez le poste, les missions, les compétences requises..."
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date limite de candidature</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
          <p className="text-xs text-gray-400 mt-1">L&apos;offre sera automatiquement archivée après cette date.</p>
        </div>

        <div />

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email de contact</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="recrutement@exemple.fr"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/40 focus:border-icc-violet"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Lien de candidature</label>
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
          {saving ? "Publication…" : isEdit ? "Enregistrer" : "Publier l'offre"}
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
