"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { CalendarX2, MapPin, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import DateTile from "./DateTile";
import { ghostDangerClasses } from "./ghost-danger";

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
  readonly departmentId: string;
  readonly departmentName?: string;
  readonly canEdit: boolean;
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
  const toast = useToast();
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

  const [pendingDelete, setPendingDelete] = useState<TeamEventItem | null>(null);
  const [scopeStep, setScopeStep] = useState<"edit" | "delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    void fetchEvents();
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
    setDeleteError(null);
  }

  async function handleSubmit(e: FormEvent) {
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
      toast.success(editing ? "Événement d'équipe modifié" : "Événement d'équipe créé");
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setScopeStep(null);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(ev: TeamEventItem) {
    setDeleteError(null);
    if (ev.seriesId) {
      setEditing(ev);
      setError(null);
      setScopeStep("delete");
      setModalOpen(true);
      return;
    }
    setPendingDelete(ev);
  }

  function cancelPendingDelete() {
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function doDelete(ev: TeamEventItem, scope: "occurrence" | "following") {
    setDeleteError(null);
    try {
      const res = await fetch(`/api/team-events/${ev.id}?scope=${scope}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        // La modale de confirmation/choix de portée reste ouverte : l'erreur y est affichée
        // (Alert) plutôt que dans un toast, qui resterait masqué derrière elle (spec 055).
        setDeleteError(data.error || "Suppression impossible. Réessayez dans un instant.");
        return;
      }
      toast.success("Événement d'équipe supprimé");
      setPendingDelete(null);
      setScopeStep(null);
      setEditing(null);
      setModalOpen(false);
      await fetchEvents();
    } catch {
      setDeleteError("Suppression impossible. Vérifiez votre connexion.");
    }
  }

  const periodOptions = [
    { value: "upcoming" as const, label: "À venir" },
    { value: "past" as const, label: "Passés" },
  ];

  return (
    <section aria-labelledby="team-events-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="team-events-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
            Événements d&apos;équipe{departmentName ? ` — ${departmentName}` : ""}
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Répétitions, réunions et formations, visibles par les STAR dans « Mon planning ».
          </p>
        </div>
        {canEdit && !(period === "upcoming" && !loading && events.length === 0) && (
          <Button size="sm" onClick={openCreate}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Nouvel événement
          </Button>
        )}
      </div>

      <fieldset aria-label="Période" className="inline-flex min-w-0 w-fit gap-0.5 rounded-control bg-surface-sunken p-[3px]">
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
            className={`min-h-10 rounded-[7px] px-4 font-display text-sm font-semibold transition-colors duration-120
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                period === option.value ? "bg-surface text-brand-text shadow-card" : "text-ink-muted hover:text-ink"
              }`}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      {truncatedMessage && <Alert tone="warning">{truncatedMessage}</Alert>}

      {loading ? (
        <SkeletonList rows={3} label="Chargement des événements d'équipe…" />
      ) : events.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarX2}
            title={period === "upcoming" ? "Aucun événement d'équipe à venir" : "Aucun événement d'équipe passé"}
            description={
              period === "upcoming" && canEdit
                ? "Planifiez une répétition, une réunion ou une formation pour votre équipe."
                : undefined
            }
            action={
              period === "upcoming" && canEdit ? (
                <Button onClick={openCreate}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Nouvel événement
                </Button>
              ) : undefined
            }
            size="sm"
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {events.map((ev) => {
            const start = new Date(ev.startsAt);
            const end = new Date(ev.endsAt);
            const dateLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
            const timeLabel = `${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

            return (
              <li
                key={ev.id}
                className="flex flex-col gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <DateTile date={start} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold leading-[22px] text-ink">
                      {ev.title}
                      {ev.seriesId && (
                        <span className="inline-flex items-center gap-1 text-[13px] font-normal text-ink-muted" title="Fait partie d'une série récurrente">
                          <Repeat aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                          <span className="sr-only sm:not-sr-only">Récurrent</span>
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {dateLabel} · {timeLabel}
                    </p>
                    {ev.location && (
                      <p className="inline-flex items-center gap-1 text-[13px] leading-[18px] text-ink-muted">
                        <MapPin aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                        {ev.location}
                      </p>
                    )}
                    {ev.description && <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{ev.description}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(ev)} aria-label={`Modifier « ${ev.title} »`}>
                      <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Modifier
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(ev)}
                      className={ghostDangerClasses}
                      aria-label={`Supprimer « ${ev.title} »`}
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Supprimer
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
            <p className="mb-6 text-[15px] leading-[22px] text-ink-muted">
              Cet événement fait partie d&apos;une série. Que souhaitez-vous modifier ?
            </p>
            {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
            <div className="flex flex-col gap-3">
              <Button onClick={() => doSave("occurrence")} disabled={saving} variant="secondary">
                {saving ? "Enregistrement…" : "Cette occurrence uniquement"}
              </Button>
              <Button onClick={() => doSave("following")} disabled={saving}>
                {saving ? "Enregistrement…" : "Cette occurrence et les suivantes"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setScopeStep(null)}>
                Retour au formulaire
              </Button>
            </div>
          </div>
        ) : scopeStep === "delete" && editing ? (
          <div>
            <p className="mb-6 text-[15px] leading-[22px] text-ink-muted">
              Cet événement fait partie d&apos;une série. Que souhaitez-vous supprimer ?
            </p>
            {deleteError && <Alert tone="danger" className="mb-4">{deleteError}</Alert>}
            <div className="flex flex-col gap-3">
              <Button onClick={() => doDelete(editing, "occurrence")} variant="secondary">
                Cette occurrence uniquement
              </Button>
              <Button onClick={() => doDelete(editing, "following")} variant="danger">
                Cette occurrence et les suivantes
              </Button>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Annuler
              </Button>
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
              label="Lieu (facultatif)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Textarea
              label="Description (facultatif)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            {!editing && (
              <>
                <Select
                  label="Récurrence (facultatif)"
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
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={closeModal} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'événement"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Supprimer cet événement d'équipe ?"
        message={`« ${pendingDelete?.title ?? ""} » sera retiré du planning des STAR du département.`}
        confirmLabel="Supprimer l'événement"
        variant="danger"
        onConfirm={() => pendingDelete && doDelete(pendingDelete, "occurrence")}
        onCancel={cancelPendingDelete}
      >
        {deleteError && <Alert tone="danger">{deleteError}</Alert>}
      </ConfirmModal>
    </section>
  );
}
