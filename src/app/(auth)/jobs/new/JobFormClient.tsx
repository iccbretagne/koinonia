"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

type JobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

export default function JobFormClient({ initial }: { readonly initial?: {
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
  const uid = useId();
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

  async function handleSubmit(e: FormEvent) {
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
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-6 space-y-5">
      {error && (
        <div className="bg-danger-soft text-danger text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor={`${uid}-f1`} className="block text-sm font-semibold text-ink-muted mb-1.5">Intitulé du poste *</label>
          <input
            id={`${uid}-f1`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React, Comptable..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-f2`} className="block text-sm font-semibold text-ink-muted mb-1.5">Type *</label>
          <select
            id={`${uid}-f2`}
            value={type}
            onChange={(e) => setType(e.target.value as JobType)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          >
            <option value="EMPLOI">Emploi</option>
            <option value="STAGE">Stage</option>
            <option value="ALTERNANCE">Alternance</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${uid}-f3`} className="block text-sm font-semibold text-ink-muted mb-1.5">Entreprise / Organisme *</label>
          <input
            id={`${uid}-f3`}
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            maxLength={150}
            placeholder="Nom de l'entreprise"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-f4`} className="block text-sm font-semibold text-ink-muted mb-1.5">Lieu</label>
          <input
            id={`${uid}-f4`}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={150}
            placeholder="Ville, région ou télétravail"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-f5`} className="block text-sm font-semibold text-ink-muted mb-1.5">Durée / Rythme</label>
          <input
            id={`${uid}-f5`}
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            maxLength={100}
            placeholder="Ex: 6 mois, CDI, 2 ans..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div className="col-span-2">
          <label htmlFor={`${uid}-f6`} className="block text-sm font-semibold text-ink-muted mb-1.5">Description *</label>
          <textarea
            id={`${uid}-f6`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Décrivez le poste, les missions, les compétences requises..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand resize-y"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-f7`} className="block text-sm font-semibold text-ink-muted mb-1.5">Date limite de candidature</label>
          <input
            id={`${uid}-f7`}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
          <p className="text-xs text-ink-subtle mt-1">L&apos;offre sera automatiquement archivée après cette date.</p>
        </div>

        <div />

        <div>
          <label htmlFor={`${uid}-f8`} className="block text-sm font-semibold text-ink-muted mb-1.5">Email de contact</label>
          <input
            id={`${uid}-f8`}
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="recrutement@exemple.fr"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/40 focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-f9`} className="block text-sm font-semibold text-ink-muted mb-1.5">Lien de candidature</label>
          <input
            id={`${uid}-f9`}
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
          {saving ? "Publication…" : isEdit ? "Enregistrer" : "Publier l'offre"}
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
