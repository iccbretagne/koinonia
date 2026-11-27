"use client";

import { SubmitEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Pencil, Repeat, Trash2 } from "lucide-react";
import {
  Alert,
  BulkActionBar,
  Button,
  Checkbox,
  ConfirmModal,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SearchInput,
  Select,
  StatusChip,
  buttonClasses,
  controlClasses,
  useToast,
} from "@/components/ui";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel } from "@/lib/event-types";
import { eventTypeTone } from "@/components/event-type-tone";

interface EventItem {
  id: string;
  title: string;
  type: string;
  date: string;
  planningDeadline: string | null;
  recurrenceRule: string | null;
  seriesId: string | null;
  isRecurrenceParent: boolean;
  church: { id: string; name: string };
  eventDepts: { department: { id: string; name: string } }[];
}

interface Props {
  readonly initialEvents: EventItem[];
  readonly churches: { id: string; name: string }[];
}

const DEADLINE_OFFSETS = [
  { value: "6h", label: "6 heures avant" },
  { value: "12h", label: "12 heures avant" },
  { value: "1d", label: "1 jour avant" },
  { value: "2d", label: "2 jours avant" },
  { value: "3d", label: "3 jours avant" },
  { value: "5d", label: "5 jours avant" },
  { value: "7d", label: "1 semaine avant" },
  { value: "", label: "Personnalisé / Aucun" },
];

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Hebdomadaire",
  biweekly: "Bi-hebdomadaire",
  monthly: "Mensuel",
};

function toLocalDatetime(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computeDeadline(eventDate: string, offset: string): string {
  if (!eventDate || !offset) return "";
  const match = /^(\d+)([hd])$/.exec(offset);
  if (!match) return "";
  const d = new Date(eventDate);
  const value = Number.parseInt(match[1], 10);
  if (match[2] === "h") d.setHours(d.getHours() - value);
  else d.setDate(d.getDate() - value);
  return toLocalDatetime(d);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function localDateStr(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Filtre persisté dans le navigateur (localStorage), avec sa valeur par défaut. */
function storedFilter(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function matchesQuery(e: EventItem, q: string) {
  return (
    e.title.toLowerCase().includes(q) ||
    e.type.toLowerCase().includes(q) ||
    e.church.name.toLowerCase().includes(q) ||
    e.eventDepts.some((ed) => ed.department.name.toLowerCase().includes(q))
  );
}

/** Événements du mois et de la recherche, du plus ancien au plus récent. */
function filterEvents(events: EventItem[], monthFilter: string, searchQuery: string) {
  let result = [...events];
  if (monthFilter) result = result.filter((e) => localDateStr(new Date(e.date)).startsWith(monthFilter));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((e) => matchesQuery(e, q));
  }
  // Sort ascending by date
  return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Champs de récurrence du formulaire : création (église + récurrence), événement d'une série
 * (retrait de la série) ou événement isolé (ajout d'une récurrence).
 */
function RecurrenceFields({
  editing,
  churches,
  churchId,
  onChurchChange,
  recurrenceRule,
  onRuleChange,
  recurrenceEnd,
  onEndChange,
  removeFromSeries,
  onRemoveFromSeriesChange,
}: {
  readonly editing: EventItem | null;
  readonly churches: Props["churches"];
  readonly churchId: string;
  readonly onChurchChange: (value: string) => void;
  readonly recurrenceRule: string;
  readonly onRuleChange: (value: string) => void;
  readonly recurrenceEnd: string;
  readonly onEndChange: (value: string) => void;
  readonly removeFromSeries: boolean;
  readonly onRemoveFromSeriesChange: (value: boolean) => void;
}) {
  return (
    <>
      {!editing && (
        <>
          <Select
            label="Église"
            value={churchId}
            onChange={(e) => onChurchChange(e.target.value)}
            options={churches.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Récurrence"
            value={recurrenceRule}
            onChange={(e) => onRuleChange(e.target.value)}
            options={[{ value: "weekly", label: "Hebdomadaire" }, { value: "biweekly", label: "Bi-hebdomadaire" }, { value: "monthly", label: "Mensuel" }]}
            placeholder="Aucune (événement unique)"
          />
          {recurrenceRule && (
            <Input label="Fin de récurrence" type="date" value={recurrenceEnd} onChange={(e) => onEndChange(e.target.value)} required />
          )}
        </>
      )}

      {editing && (editing.seriesId || editing.isRecurrenceParent) && (
        <div className="flex flex-col gap-2 rounded-control border border-line p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Récurrence</span>
            {editing.recurrenceRule && (
              <StatusChip tone="warning">{RECURRENCE_LABELS[editing.recurrenceRule] ?? editing.recurrenceRule}</StatusChip>
            )}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={removeFromSeries}
              onChange={(e) => onRemoveFromSeriesChange(e.target.checked)}
            />
            <span className="text-[15px] leading-[22px] text-ink">Retirer cet événement de la série (le rendre indépendant)</span>
          </label>
        </div>
      )}

      {editing && !editing.seriesId && !editing.isRecurrenceParent && (
        <div className="space-y-3">
          <Select
            label="Ajouter une récurrence"
            value={recurrenceRule}
            onChange={(e) => onRuleChange(e.target.value)}
            options={[{ value: "weekly", label: "Hebdomadaire" }, { value: "biweekly", label: "Bi-hebdomadaire" }, { value: "monthly", label: "Mensuel" }]}
            placeholder="Aucune (événement unique)"
          />
          {recurrenceRule && (
            <Input label="Fin de récurrence" type="date" value={recurrenceEnd} onChange={(e) => onEndChange(e.target.value)} required />
          )}
        </div>
      )}
    </>
  );
}

/** Choix de portée d'une modification dans une série : cet événement seul ou toute la série. */
function SeriesScopeChoice({
  seriesCount,
  error,
  loading,
  onChoose,
  onBack,
}: {
  readonly seriesCount: number;
  readonly error: string;
  readonly loading: boolean;
  readonly onChoose: (wholeSeries: boolean) => void;
  readonly onBack: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-ink-muted mb-6">
        Cet événement fait partie d&apos;une série de{" "}
        <span className="font-semibold text-ink">{seriesCount > 1 ? `${seriesCount} événements` : "1 événement"}</span>.
        Que souhaitez-vous modifier ?
      </p>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-3">
        <Button onClick={() => onChoose(false)} disabled={loading} variant="secondary">
          {loading ? "Enregistrement…" : "Modifier cet événement seul"}
        </Button>
        <Button onClick={() => onChoose(true)} disabled={loading}>
          {loading ? "Enregistrement…" : `Modifier toute la série (${seriesCount} événements)`}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Revenir au formulaire
        </Button>
      </div>
    </div>
  );
}

export default function EventsClient({ initialEvents, churches }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [churchId, setChurchId] = useState(churches[0]?.id || "");
  const [planningDeadline, setPlanningDeadline] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [deadlineOffset, setDeadlineOffset] = useState("2d");
  const [removeFromSeries, setRemoveFromSeries] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkType, setBulkType] = useState("");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState("");
  const [duplicateTargetId, setDuplicateTargetId] = useState("");
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");
  const [seriesStep, setSeriesStep] = useState(false);
  const [seriesCount, setSeriesCount] = useState(0);
  /** Suppression à confirmer : un événement ou la sélection. */
  const [pendingDelete, setPendingDelete] = useState<EventItem | "selection" | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Persisted filters via localStorage
  const [monthFilter, setMonthFilter] = useState<string>(() => storedFilter("eventsMonthFilter", defaultMonth()));
  const [searchQuery, setSearchQuery] = useState<string>(() => storedFilter("eventsSearchQuery", ""));

  const filteredEvents = useMemo(
    () => filterEvents(events, monthFilter, searchQuery),
    [events, monthFilter, searchQuery]
  );

  function getSeriesCount(ev: EventItem): number {
    const parentId = ev.isRecurrenceParent ? ev.id : ev.seriesId;
    if (!parentId) return 0;
    return events.filter((e) => e.id === parentId || e.seriesId === parentId).length;
  }

  function handleMonthChange(value: string) {
    setMonthFilter(value);
    if (typeof window !== "undefined") localStorage.setItem("eventsMonthFilter", value);
    setSelectedIds(new Set());
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (typeof window !== "undefined") localStorage.setItem("eventsSearchQuery", value);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvents.map((e) => e.id)));
    }
  }

  function openCreate() {
    setEditing(null);
    setTitle(""); setType(""); setDate("");
    setChurchId(churches[0]?.id || "");
    setPlanningDeadline(""); setDeadlineOffset("2d");
    setRecurrenceRule(""); setRecurrenceEnd("");
    setRemoveFromSeries(false);
    setSeriesStep(false); setError("");
    setModalOpen(true);
  }

  function openEdit(ev: EventItem) {
    setEditing(ev);
    setTitle(ev.title); setType(ev.type);
    setDate(toLocalDatetime(ev.date));
    setChurchId(ev.church.id);
    setPlanningDeadline(ev.planningDeadline ? toLocalDatetime(ev.planningDeadline) : "");
    setDeadlineOffset("");
    setRecurrenceRule(ev.recurrenceRule ?? "");
    setRecurrenceEnd("");
    setRemoveFromSeries(false);
    setSeriesStep(false); setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (removeFromSeries) { await doSubmit(false); return; }
    if (editing && (editing.seriesId || editing.isRecurrenceParent)) {
      setSeriesCount(getSeriesCount(editing));
      setSeriesStep(true);
      return;
    }
    await doSubmit(false);
  }

  async function reloadEvents() {
    const cid = churches[0]?.id;
    if (!cid) return;
    const listRes = await fetch(`/api/events?churchId=${cid}`);
    if (listRes.ok) setEvents(await listRes.json());
  }

  async function doSubmit(applyToSeries: boolean) {
    setLoading(true); setError("");
    try {
      const url = editing ? `/api/events/${editing.id}` : "/api/events";
      const method = editing ? "PUT" : "POST";
      const body = editing
        ? { title, type, date, planningDeadline: planningDeadline || null, applyToSeries, removeFromSeries }
        : { title, type, date, churchId, planningDeadline: planningDeadline || null, deadlineOffset: deadlineOffset || null, recurrenceRule: recurrenceRule || null, recurrenceEnd: recurrenceEnd || null };

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      announceNotified(await res.json());

      await reloadEvents();
      setModalOpen(false); setSeriesStep(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  /** Spec 059 : nombre de personnes planifiées prévenues d'un déplacement ou d'une annulation. */
  function announceNotified(body: { notified?: number }) {
    const n = body?.notified ?? 0;
    if (n > 0) toast.success(`${n} personne${n > 1 ? "s" : ""} prévenue${n > 1 ? "s" : ""}`);
  }

  async function handleDelete(ev: EventItem) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur lors de la suppression"); return; }
      announceNotified(await res.json());
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      setPendingDelete(null);
      toast.success("Événement supprimé");
    } catch { toast.error("Erreur lors de la suppression"); } finally { setDeleting(false); }
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur lors de la suppression"); return; }
      announceNotified(await res.json());
      setEvents((prev) => prev.filter((ev) => !selectedIds.has(ev.id)));
      toast.success(selectedIds.size > 1 ? "Événements supprimés" : "Événement supprimé");
      setSelectedIds(new Set());
      setPendingDelete(null);
    } catch { toast.error("Erreur lors de la suppression"); } finally { setDeleting(false); }
  }

  function openBulkEdit() {
    setBulkTitle(""); setBulkType(""); setBulkDate(""); setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: SubmitEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkTitle) data.title = bulkTitle;
    if (bulkType) data.type = bulkType;
    if (bulkDate) data.date = bulkDate;
    if (Object.keys(data).length === 0) { setBulkError("Remplissez au moins un champ"); return; }
    setBulkLoading(true); setBulkError("");
    try {
      const res = await fetch("/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }) });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || "Erreur"); }
      announceNotified(await res.json());
      setEvents((prev) => prev.map((ev) => {
        if (!selectedIds.has(ev.id)) return ev;
        const updated = { ...ev };
        if (data.title) updated.title = data.title;
        if (data.type) updated.type = data.type;
        if (data.date) updated.date = new Date(data.date).toISOString();
        return updated;
      }));
      setSelectedIds(new Set()); setBulkModalOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Erreur");
    } finally { setBulkLoading(false); }
  }

  function openDuplicate(ev: EventItem) {
    setDuplicateSourceId(ev.id); setDuplicateTargetId(""); setDuplicateError("");
    setDuplicateModalOpen(true);
  }

  async function handleDuplicate(e: SubmitEvent) {
    e.preventDefault();
    if (!duplicateTargetId) { setDuplicateError("Sélectionnez un événement cible"); return; }
    setDuplicateLoading(true); setDuplicateError("");
    try {
      const res = await fetch(`/api/events/${duplicateSourceId}/duplicate-planning`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetEventId: duplicateTargetId }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      const result = await res.json();
      const copied = result.copied > 1 ? `${result.copied} affectations copiées` : `${result.copied} affectation copiée`;
      const depts = result.departments > 1 ? `${result.departments} départements` : `${result.departments} département`;
      toast.success(`Planning dupliqué : ${copied} sur ${depts}`);
      setDuplicateModalOpen(false);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : "Erreur");
    } finally { setDuplicateLoading(false); }
  }

  const allSelected = filteredEvents.length > 0 && selectedIds.size === filteredEvents.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  let modalTitle = "Créer un événement";
  if (seriesStep) modalTitle = "Modifier un événement récurrent";
  else if (editing) modalTitle = "Modifier l'événement";

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={openCreate}>Créer un événement</Button>
        <SearchInput
          aria-label="Rechercher un événement"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Rechercher…"
          className="w-full sm:w-64"
        />
        <input
          type="month"
          aria-label="Mois affiché"
          value={monthFilter}
          onChange={(e) => handleMonthChange(e.target.value)}
          className={`${controlClasses()} w-full capitalize sm:w-auto`}
        />
        {(monthFilter !== defaultMonth() || searchQuery) && (
          <Button type="button" variant="ghost" onClick={() => { handleMonthChange(defaultMonth()); handleSearchChange(""); }}>
            Réinitialiser les filtres
          </Button>
        )}
        <span className="ml-auto text-[13px] leading-[18px] text-ink-muted">{filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""}</span>
      </div>

      {/* Card list */}
      <div className="flex flex-col gap-2">
        {/* Select all header */}
        {filteredEvents.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card border border-line bg-surface px-3">
            <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleSelectAll} />
            <span className="text-sm text-ink">Tout sélectionner</span>
          </label>
        )}

        {filteredEvents.length === 0 && (
          <EmptyState
            title={monthFilter || searchQuery ? "Aucun événement trouvé" : "Aucun événement"}
            description={monthFilter || searchQuery ? "Changez de mois ou modifiez la recherche." : undefined}
          />
        )}

        {filteredEvents.map((ev) => {
          const d = new Date(ev.date);
          const dayNum = d.getDate();
          const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
          const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          const dateLabel = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
          const isSelected = selectedIds.has(ev.id);
          const seriesParentId = ev.isRecurrenceParent ? ev.id : ev.seriesId;
          const isRecurrent = ev.isRecurrenceParent || !!ev.seriesId;
          const recurrenceLabel = ev.recurrenceRule ? ` — ${RECURRENCE_LABELS[ev.recurrenceRule] ?? ev.recurrenceRule}` : "";
          const recurrenceTitle = `Récurrent${recurrenceLabel}`;

          return (
            <div key={ev.id} className={`rounded-card border-2 bg-surface transition-colors ${isSelected ? "border-brand/40 bg-brand-soft" : "border-line"}`}>
              <div className="flex items-start gap-3 p-3">
                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleSelect(ev.id)}
                  aria-label={`Sélectionner ${ev.title}`}
                  className="mt-3.5"
                />

                {/* Date block */}
                <div className="mt-0.5 flex w-11 shrink-0 flex-col items-center justify-center rounded-control bg-brand-soft py-2">
                  <span className="text-[11px] font-semibold uppercase leading-none text-brand-text">{weekday}</span>
                  <span className="mt-0.5 font-display text-xl font-bold leading-none text-brand-text">{dayNum}</span>
                </div>

                {/* Content + Actions */}
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-2">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold leading-[22px] text-ink">{ev.title}</span>
                      {isRecurrent && (
                        <span title={recurrenceTitle} className="text-ink-muted">
                          <Repeat aria-label={recurrenceTitle} className="size-4" strokeWidth={1.75} />
                        </span>
                      )}
                      <StatusChip tone={eventTypeTone(ev.type)}>{getEventTypeLabel(ev.type)}</StatusChip>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{dateLabel} {timeStr} — {ev.church.name}</p>
                    {ev.eventDepts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {ev.eventDepts.map((ed) => (
                          <StatusChip key={ed.department.id}>{ed.department.name}</StatusChip>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1 shrink-0 justify-end items-center">
                    <Link href={`/events/${ev.id}/star-view`} className={buttonClasses("secondary", "sm")}>
                      Planning
                    </Link>
                    {seriesParentId && seriesParentId !== ev.id && (
                      <Link href={`/admin/events/${seriesParentId}`} className={buttonClasses("secondary", "sm")} title="Configurer toute la série">
                        Série
                      </Link>
                    )}
                    <Link href={`/admin/events/${ev.id}`} className={buttonClasses("secondary", "sm")}>
                      Configurer
                    </Link>
                    <IconButton icon={Copy} aria-label={`Dupliquer le planning de ${ev.title}`} title="Dupliquer le planning" onClick={() => openDuplicate(ev)} />
                    <IconButton icon={Pencil} aria-label={`Modifier ${ev.title}`} title="Modifier" onClick={() => openEdit(ev)} />
                    <IconButton icon={Trash2} aria-label={`Supprimer ${ev.title}`} title="Supprimer" onClick={() => setPendingDelete(ev)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={() => setPendingDelete("selection")}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSeriesStep(false); }}
        title={modalTitle}
      >
        {seriesStep ? (
          <SeriesScopeChoice
            seriesCount={seriesCount}
            error={error}
            loading={loading}
            onChoose={doSubmit}
            onBack={() => setSeriesStep(false)}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={EVENT_TYPE_OPTIONS} placeholder="Choisir un type" required />
            <Input
              label="Date et heure"
              type="datetime-local"
              value={date}
              onChange={(e) => {
                const newDate = e.target.value;
                setDate(newDate);
                if (deadlineOffset && newDate) setPlanningDeadline(computeDeadline(newDate, deadlineOffset));
              }}
              required
            />
            <Select
              label="Délai avant l'événement"
              value={deadlineOffset}
              onChange={(e) => {
                const offset = e.target.value;
                setDeadlineOffset(offset);
                if (offset && date) setPlanningDeadline(computeDeadline(date, offset));
              }}
              options={DEADLINE_OFFSETS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Input
              label="Date limite de planification"
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => { setPlanningDeadline(e.target.value); setDeadlineOffset(""); }}
            />

            {/* Récurrence */}
            <RecurrenceFields
              editing={editing}
              churches={churches}
              churchId={churchId}
              onChurchChange={setChurchId}
              recurrenceRule={recurrenceRule}
              onRuleChange={setRecurrenceRule}
              recurrenceEnd={recurrenceEnd}
              onEndChange={setRecurrenceEnd}
              removeFromSeries={removeFromSeries}
              onRemoveFromSeriesChange={setRemoveFromSeries}
            />

            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>{loading ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Bulk edit modal */}
      <Modal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title={selectedIds.size > 1 ? `Modifier ${selectedIds.size} événements` : "Modifier 1 événement"}>
        <p className="text-sm text-ink-muted mb-4">Seuls les champs remplis seront modifiés.</p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input label="Titre" value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} placeholder="Laisser vide pour ne pas modifier" />
          <Select label="Type" value={bulkType} onChange={(e) => setBulkType(e.target.value)} options={EVENT_TYPE_OPTIONS} placeholder="Laisser vide pour ne pas modifier" />
          <Input label="Date" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          {bulkError && <Alert tone="danger">{bulkError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setBulkModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={bulkLoading}>{bulkLoading ? "Enregistrement…" : "Appliquer"}</Button>
          </div>
        </form>
      </Modal>

      {/* Duplicate modal */}
      <Modal open={duplicateModalOpen} onClose={() => setDuplicateModalOpen(false)} title="Dupliquer un planning">
        <p className="text-sm text-ink-muted mb-4">
          Copier les affectations de l&apos;événement source vers un événement cible.
          Seuls les départements communs seront dupliqués.
        </p>
        <form onSubmit={handleDuplicate} className="space-y-4">
          <Select
            label="Événement cible"
            value={duplicateTargetId}
            onChange={(e) => setDuplicateTargetId(e.target.value)}
            placeholder="Choisir l'événement cible"
            options={events.filter((ev) => ev.id !== duplicateSourceId).map((ev) => ({ value: ev.id, label: `${ev.title} (${formatDate(ev.date)})` }))}
          />
          {duplicateError && <Alert tone="danger">{duplicateError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDuplicateModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={duplicateLoading}>{duplicateLoading ? "Duplication…" : "Dupliquer le planning"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={
          pendingDelete === "selection"
            ? selectedIds.size > 1
              ? `Supprimer ${selectedIds.size} événements ?`
              : "Supprimer 1 événement ?"
            : `Supprimer l'événement « ${pendingDelete?.title ?? ""} » ?`
        }
        message="Le planning et le compte rendu de l'événement sont supprimés ; les personnes planifiées sont prévenues."
        confirmLabel={pendingDelete === "selection" && selectedIds.size > 1 ? "Supprimer les événements" : "Supprimer l'événement"}
        confirmingLabel="Suppression…"
        confirming={deleting}
        onConfirm={() => {
          if (pendingDelete === "selection") void handleBulkDelete();
          else if (pendingDelete) void handleDelete(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
