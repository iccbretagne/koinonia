"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, Textarea, fieldLabelClasses } from "@/components/ui";
import { choiceChipClasses } from "@/components/ui/RadioGroup";
import { paths } from "@/lib/paths";

interface Profile { id: string; name: string; role: string }
interface Props { readonly churchId: string; readonly profiles: Profile[] }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function NewEntryForm({ churchId, profiles }: Props) {
  const router = useRouter();
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "ACTIVITY" as "ACTIVITY" | "APPOINTMENT",
    recipientId: profiles[0]?.id ?? "",
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    location: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!form.recipientId || !form.title || !form.startsAt) {
      setError("Profil, titre et date de début sont requis.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agenda/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          recipientId: form.recipientId,
          type: form.type,
          title: form.title,
          description: form.description || null,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          location: form.location || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "L'enregistrement a échoué. Veuillez réessayer.");
        return;
      }
      router.push(paths.agenda());
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="min-w-0">
        <legend className={`${fieldLabelClasses} mb-2`}>Type</legend>
        <div className="flex flex-wrap gap-2">
          {(["ACTIVITY", "APPOINTMENT"] as const).map((t) => (
            <label key={t} className={choiceChipClasses(form.type === t)}>
              <input
                type="radio"
                name="type"
                value={t}
                checked={form.type === t}
                onChange={() => set("type", t)}
                className="sr-only"
              />
              {t === "ACTIVITY" ? "Activité" : "Rendez-vous"}
            </label>
          ))}
        </div>
      </fieldset>

      <Select
        id={`${id}-f1`}
        label="Profil pastoral"
        value={form.recipientId}
        onChange={(e) => set("recipientId", e.target.value)}
        required
        options={profiles.map((p) => ({ value: p.id, label: `${p.name} — ${ROLE_LABELS[p.role] ?? p.role}` }))}
      />

      <Input
        id={`${id}-f2`}
        label="Titre"
        type="text"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        required
        placeholder="Culte, réunion d'équipe, RDV avec…"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id={`${id}-f3`}
          label="Début"
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => set("startsAt", e.target.value)}
          required
        />
        <Input
          id={`${id}-f4`}
          label="Fin (facultatif)"
          type="datetime-local"
          value={form.endsAt}
          onChange={(e) => set("endsAt", e.target.value)}
        />
      </div>

      <Input
        id={`${id}-f5`}
        label="Lieu (facultatif)"
        type="text"
        value={form.location}
        onChange={(e) => set("location", e.target.value)}
        placeholder="Salle, adresse…"
      />

      <Textarea
        id={`${id}-f6`}
        label="Description (facultatif)"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        rows={3}
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Enregistrement en cours…" : "Ajouter à l'agenda"}
        </Button>
      </div>
    </form>
  );
}
