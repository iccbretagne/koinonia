"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import JobFormActions from "../../../JobFormActions";
import FreelanceRateFields from "../../FreelanceRateFields";
import JobContactFields from "../../../JobContactFields";

type Modality = "REMOTE" | "ONSITE" | "HYBRID";

interface ProfileInitial {
  id: string;
  title: string;
  domain: string;
  dailyRate: string | null;
  hourlyRate: string | null;
  modality: Modality;
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
  readonly initial?: ProfileInitial;
  readonly defaultEmail?: string | null;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const submitLabel = isEdit ? "Enregistrer" : "Publier mon profil freelance";

  const [title,        setTitle]        = useState(initial?.title        ?? "");
  const [domain,       setDomain]       = useState(initial?.domain       ?? "");
  const [dailyRate,    setDailyRate]    = useState(initial?.dailyRate    ?? "");
  const [hourlyRate,   setHourlyRate]   = useState(initial?.hourlyRate   ?? "");
  const [modality,     setModality]     = useState<Modality>(initial?.modality ?? "REMOTE");
  const [location,     setLocation]     = useState(initial?.location     ?? "");
  const [availableFrom, setAvailableFrom] = useState(
    initial?.availableFrom ? new Date(initial.availableFrom).toISOString().slice(0, 10) : ""
  );
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
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-line p-6 space-y-5">
      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            label="Titre *"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex: Développeur React disponible pour missions"
          />
        </div>

        <div className="col-span-2">
          <Input
            label="Domaine / Stack technique *"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            maxLength={150}
            placeholder="Ex: Développement web, Design, Comptabilité..."
          />
        </div>

        <Select
          label="Modalité *"
          value={modality}
          onChange={(e) => setModality(e.target.value as Modality)}
          options={[
            { value: "REMOTE", label: "Full remote" },
            { value: "ONSITE", label: "Présentiel" },
            { value: "HYBRID", label: "Hybride" },
          ]}
        />

        <Input
          label="Disponible à partir du"
          type="date"
          value={availableFrom}
          onChange={(e) => setAvailableFrom(e.target.value)}
        />

        <FreelanceRateFields
          dailyRate={dailyRate}
          onDailyRateChange={setDailyRate}
          hourlyRate={hourlyRate}
          onHourlyRateChange={setHourlyRate}
          remote={modality === "REMOTE"}
          location={location}
          onLocationChange={setLocation}
        />

        <div className="col-span-2">
          <Textarea
            label="Présentation *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={6}
            placeholder="Présentez vos compétences, expériences et ce que vous proposez..."
          />
        </div>

        <JobContactFields
          email={contactEmail}
          onEmailChange={setContactEmail}
          url={contactUrl}
          onUrlChange={setContactUrl}
          urlLabel="LinkedIn / Portfolio"
        />
      </div>

      <JobFormActions saving={saving} label={saving ? "Publication…" : submitLabel} />
    </form>
  );
}
