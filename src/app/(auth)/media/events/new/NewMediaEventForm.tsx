"use client";

import { SubmitEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
  const id = useId();
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
      router.push(`/media/events/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {planningEvents.length > 0 && (
        <div>
          <label htmlFor={`${id}-f1`} className="block text-sm font-medium text-ink-muted mb-1">
            Lier à un événement planning <span className="text-ink-subtle">(optionnel)</span>
          </label>
          <select id={`${id}-f1`}
            value={planningEventId}
            onChange={(e) => onPlanningEventChange(e.target.value)}
            className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
          >
            <option value="">— Aucun —</option>
            {planningEvents.map((pe) => (
              <option key={pe.id} value={pe.id}>
                {pe.title} — {formatDate(pe.date)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-f2`} className="block text-sm font-medium text-ink-muted mb-1">
          Nom de l&apos;événement <span className="text-danger">*</span>
        </label>
        <Input id={`${id}-f2`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Ex: Culte du 20 avril 2026"
        />
      </div>

      <div>
        <label htmlFor={`${id}-f3`} className="block text-sm font-medium text-ink-muted mb-1">
          Date <span className="text-danger">*</span>
        </label>
        <Input id={`${id}-f3`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor={`${id}-f4`} className="block text-sm font-medium text-ink-muted mb-1">
          Description <span className="text-ink-subtle">(optionnel)</span>
        </label>
        <textarea id={`${id}-f4`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Notes ou contexte…"
          className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Création…" : "Créer l'événement"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/media/events")}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
