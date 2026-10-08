"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Alert from "@/components/ui/Alert";
import JobFormActions from "../../JobFormActions";
import JobContactFields from "../../JobContactFields";

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
  readonly initial?: SeekerInitial;
  readonly defaultEmail?: string | null;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const submitLabel = isEdit ? "Enregistrer" : "Publier mon profil";

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

  async function handleSubmit(e: SubmitEvent) {
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
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-6 space-y-5">
      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            label="Titre de la recherche *"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React en recherche de CDI"
          />
        </div>

        <fieldset className="col-span-2 min-w-0">
          <legend className="block text-sm font-semibold text-ink-muted mb-2">
            Type(s) de contrat recherché(s) *
          </legend>
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
                  className="w-4 h-4 rounded border border-control-line accent-brand"
                />
                <span className="text-sm text-ink-muted">{label}</span>
              </label>
            ))}
          </div>
          {noContractSelected && (
            <p className="text-xs text-danger mt-1">Sélectionnez au moins un type de contrat.</p>
          )}
        </fieldset>

        <Input
          label="Secteur / Domaine"
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          maxLength={150}
          placeholder="Ex: Informatique, Finance, RH..."
        />

        <Input
          label="Localisation souhaitée"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={150}
          placeholder="Ville, région..."
        />

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="remote"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            className="w-4 h-4 rounded border border-control-line accent-brand"
          />
          <label htmlFor="remote" className="text-sm font-semibold text-ink-muted cursor-pointer">
            Ouvert au télétravail
          </label>
        </div>

        <Input
          label="Disponible à partir du"
          type="date"
          value={availableFrom}
          onChange={(e) => setAvailableFrom(e.target.value)}
        />

        <div className="col-span-2">
          <Textarea
            label="Présentation *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Présentez votre profil, vos compétences, vos expériences et ce que vous recherchez..."
          />
        </div>

        <JobContactFields
          email={contactEmail}
          onEmailChange={setContactEmail}
          urlPlaceholder="https://linkedin.com/in/..."
          url={contactUrl}
          onUrlChange={setContactUrl}
          urlLabel="LinkedIn / Portfolio"
        />
      </div>

      <JobFormActions saving={saving} label={saving ? "Publication…" : submitLabel} />
    </form>
  );
}
