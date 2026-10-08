"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import JobFormActions from "../JobFormActions";
import JobContactFields from "../JobContactFields";

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

  async function handleSubmit(e: SubmitEvent) {
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

  let submitLabel = "Publier l'offre";
  if (saving) submitLabel = "Publication…";
  else if (isEdit) submitLabel = "Enregistrer";

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-6 space-y-5">
      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            label="Intitulé du poste *"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React, Comptable..."
          />
        </div>

        <Select
          label="Type *"
          value={type}
          onChange={(e) => setType(e.target.value as JobType)}
          options={[
            { value: "EMPLOI", label: "Emploi" },
            { value: "STAGE", label: "Stage" },
            { value: "ALTERNANCE", label: "Alternance" },
          ]}
        />

        <Input
          label="Entreprise / Organisme *"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
          maxLength={150}
          placeholder="Nom de l'entreprise"
        />

        <Input
          label="Lieu"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={150}
          placeholder="Ville, région ou télétravail"
        />

        <Input
          label="Durée / Rythme"
          type="text"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          maxLength={100}
          placeholder="Ex: 6 mois, CDI, 2 ans..."
        />

        <div className="col-span-2">
          <Textarea
            label="Description *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Décrivez le poste, les missions, les compétences requises..."
          />
        </div>

        <Input
          label="Date limite de candidature"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          hint="L'offre sera automatiquement archivée après cette date."
        />

        <div />

        <JobContactFields
          email={contactEmail}
          onEmailChange={setContactEmail}
          emailPlaceholder="recrutement@exemple.fr"
          url={contactUrl}
          onUrlChange={setContactUrl}
          urlLabel="Lien de candidature"
        />
      </div>

      <JobFormActions saving={saving} label={submitLabel} />
    </form>
  );
}
