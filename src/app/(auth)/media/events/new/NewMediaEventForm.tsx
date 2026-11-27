"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Alert, Select, Textarea } from "@/components/ui";
import { paths } from "@/lib/paths";

type PlanningEvent = {
  id: string;
  title: string;
  type: string;
  date: Date;
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function NewMediaEventForm({
  churchId,
  planningEvents,
}: {
  readonly churchId: string;
  readonly planningEvents: PlanningEvent[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [planningEventId, setPlanningEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill name from selected planning event
  function onPlanningEventChange(id: string) {
    setPlanningEventId(id);
    if (id) {
      const pe = planningEvents.find((e) => e.id === id);
      if (pe && !name) {
        setName(pe.title);
        if (!date) {
          const d = new Date(pe.date);
          setDate(d.toISOString().split("T")[0]);
        }
      }
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/media-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date,
          churchId,
          description: description || null,
          planningEventId: planningEventId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de la création");
      router.push(paths.media.event(json.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {planningEvents.length > 0 && (
        <Select
          label="Lier à un événement du planning (facultatif)"
          value={planningEventId}
          onChange={(e) => onPlanningEventChange(e.target.value)}
          placeholder="Aucun"
          options={planningEvents.map((pe) => ({ value: pe.id, label: `${pe.title} — ${formatDate(pe.date)}` }))}
        />
      )}

      <Input
        label="Nom de l'événement"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Ex : Culte du 20 avril 2026"
      />

      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

      <Textarea
        label="Description (facultative)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Notes ou contexte…"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Création en cours…" : "Créer l'événement"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(paths.media.events())}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
