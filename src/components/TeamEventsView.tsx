"use client";

import { useState, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";

interface TeamEventItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string | null;
  recurrenceRule: string | null;
  seriesId: string | null;
  department: { id: string; name: string };
}

interface TeamEventsViewProps {
  departmentId: string;
  departmentName?: string;
  canEdit: boolean;
}

const RECURRENCE_OPTIONS = [
  { value: "weekly", label: "Toutes les semaines" },
  { value: "biweekly", label: "Toutes les deux semaines" },
  { value: "monthly", label: "Tous les mois" },
];

function toLocalDatetime(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TeamEventsView({ departmentId, departmentName, canEdit }: TeamEventsViewProps) {
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [events, setEvents] = useState<TeamEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamEventItem | null>(null);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncatedMessage, setTruncatedMessage] = useState<string | null>(null);

  const [scopeStep, setScopeStep] = useState<"edit" | "delete" | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/departments/${departmentId}/team-events?period=${period}`);
      if (res.ok) setEvents(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [departmentId, period]);

  useEffect(() => {
    setLoading(true);
    fetchEvents();
  }, [fetchEvents]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setStartsAt("");
    setEndsAt("");
    setLocation("");
    setDescription("");
    setRecurrenceRule("");
    setRecurrenceUntil("");
    setError(null);
    setScopeStep(null);
    setModalOpen(true);
  }

  function openEdit(ev: TeamEventItem) {
    setEditing(ev);
    setTitle(ev.title);
    setStartsAt(toLocalDatetime(ev.startsAt));
    setEndsAt(toLocalDatetime(ev.endsAt));
    setLocation(ev.location ?? "");
    setDescription(ev.description ?? "");
    setRecurrenceRule("");
    setRecurrenceUntil("");
    setError(null);
    setScopeStep(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setScopeStep(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing?.seriesId) {
      setScopeStep("edit");
      return;
    }
    await doSave("occurrence");
  }

  async function doSave(scope: "occurrence" | "following") {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title, startsAt, endsAt, location: location || null, description: description || null };
      let res: Response;
      if (editing) {
        res = await fetch(`/api/team-events/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, scope }),
        });
      } else {
        res = await fetch(`/api/departments/${departmentId}/team-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            recurrence: recurrenceRule ? { rule: recurrenceRule, until: recurrenceUntil } : null,
          }),
        });
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }
      const data = await res.json();
      if (data.truncated) {
        setTruncatedMessage(
          "La série a été limitée à 104 occurrences (~2 ans). Certaines dates au-delà de cette limite n'ont pas été créées."
        );
      }
      closeModal();
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setScopeStep(null);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(ev: TeamEventItem) {
    if (ev.seriesId) {
      setEditing(ev);
      setError(null);
      setScopeStep("delete");
      setModalOpen(true);
      return;
    }
    if (!confirm(`Supprimer l'événement d'équipe « ${ev.title} » ?`)) return;
    doDelete(ev, "occurrence");
  }

  async function doDelete(ev: TeamEventItem, scope: "occurrence" | "following") {
    try {
      const res = await fetch(`/api/team-events/${ev.id}?scope=${scope}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setScopeStep(null);
      setEditing(null);
      setModalOpen(false);
      await fetchEvents();
    } catch {
      alert("Erreur réseau");
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement des événements d&apos;équipe...</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Événements d&apos;équipe{departmentName ? ` — ${departmentName}` : ""}
        </h2>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            + Nouvel événement d&apos;équipe
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setPeriod("upcoming")}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
            period === "upcoming"
              ? "bg-icc-violet text-white border-icc-violet"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          À venir
        </button>
        <button
          onClick={() => setPeriod("past")}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
            period === "past"
              ? "bg-icc-violet text-white border-icc-violet"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Passés
        </button>
      </div>

      {truncatedMessage && (
        <div className="mb-4 p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
          {truncatedMessage}
        </div>
      )}

      {events.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          {period === "upcoming" ? "Aucun événement d'équipe à venir" : "Aucun événement d'équipe passé"}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const start = new Date(ev.startsAt);
            const end = new Date(ev.endsAt);
            const dateLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
            const timeLabel = `${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

            return (
              <div
                key={ev.id}
                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-gray-800 text-sm">{ev.title}</span>
                    {ev.seriesId && (
                      <span className="text-icc-violet text-sm" title="Fait partie d'une série récurrente">
                        ↻
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {dateLabel} · {timeLabel}
                    {ev.location ? ` · ${ev.location}` : ""}
                  </p>
                  {ev.description && <p className="text-xs text-gray-500 mt-1">{ev.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0 justify-end">
                    <Button variant="edit" size="sm" onClick={() => openEdit(ev)}>
                      Modifier
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteClick(ev)}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          scopeStep
            ? scopeStep === "edit"
              ? "Modifier un événement récurrent"
              : "Supprimer un événement récurrent"
            : editing
              ? "Modifier l'événement d'équipe"
              : "Nouvel événement d'équipe"
        }
      >
        {scopeStep === "edit" ? (
          <div>
            <p className="text-sm text-gray-600 mb-6">
              Cet événement fait partie d&apos;une série. Que souhaitez-vous modifier ?
            </p>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            <div className="flex flex-col gap-3">
              <Button onClick={() => doSave("occurrence")} disabled={saving} variant="secondary">
                {saving ? "Enregistrement..." : "Cette occurrence uniquement"}
              </Button>
              <Button onClick={() => doSave("following")} disabled={saving}>
                {saving ? "Enregistrement..." : "Cette occurrence et les suivantes"}
              </Button>
              <button
                type="button"
                onClick={() => setScopeStep(null)}
                className="text-sm text-gray-500 hover:text-gray-700 underline mt-1"
              >
                Retour au formulaire
              </button>
            </div>
          </div>
        ) : scopeStep === "delete" && editing ? (
          <div>
            <p className="text-sm text-gray-600 mb-6">
              Cet événement fait partie d&apos;une série. Que souhaitez-vous supprimer ?
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => doDelete(editing, "occurrence")} variant="secondary">
                Cette occurrence uniquement
              </Button>
              <Button onClick={() => doDelete(editing, "following")} variant="danger">
                Cette occurrence et les suivantes
              </Button>
              <button
                type="button"
                onClick={closeModal}
                className="text-sm text-gray-500 hover:text-gray-700 underline mt-1"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Début"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
              <Input
                label="Fin"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
            <Input
              label="Lieu (optionnel)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Description (optionnel)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="block w-full px-3 py-2.5 md:py-2 border-2 border-gray-300 rounded-lg shadow-sm text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
              />
            </div>
            {!editing && (
              <>
                <Select
                  label="Récurrence (optionnel)"
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value)}
                  options={RECURRENCE_OPTIONS}
                  placeholder="Aucune récurrence"
                />
                {recurrenceRule && (
                  <Input
                    label="Jusqu'au"
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    required
                  />
                )}
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={closeModal} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
