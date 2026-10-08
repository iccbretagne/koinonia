"use client";

import { SubmitEvent, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel } from "@/lib/event-types";
import { eventTypeTone } from "@/components/event-type-tone";
import Modal from "@/components/ui/Modal";
import BulkActionBar from "@/components/ui/BulkActionBar";
import StatusChip from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";

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
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-warning uppercase tracking-wide">Récurrence</span>
            {editing.recurrenceRule && (
              <span className="text-xs bg-warning-soft text-warning px-2 py-0.5 rounded-full font-medium">
                {RECURRENCE_LABELS[editing.recurrenceRule] ?? editing.recurrenceRule}
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={removeFromSeries}
              onChange={(e) => onRemoveFromSeriesChange(e.target.checked)}
              className="h-4 w-4 rounded border-control-line text-danger focus:ring-danger"
            />
            <span className="text-sm text-ink-muted">Retirer cet événement de la série (le rendre indépendant)</span>
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
        <span className="font-semibold">{seriesCount} événement(s)</span>.
        Que souhaitez-vous modifier ?
      </p>
      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      <div className="flex flex-col gap-3">
        <Button onClick={() => onChoose(false)} disabled={loading} variant="secondary">
          {loading ? "Enregistrement..." : "Cet événement seul"}
        </Button>
        <Button onClick={() => onChoose(true)} disabled={loading}>
          {loading ? "Enregistrement..." : `Toute la série (${seriesCount} événements)`}
        </Button>
        <button type="button" onClick={onBack} className="text-sm text-ink-muted hover:text-ink-muted underline mt-1">
          Retour au formulaire
        </button>
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
    if (!confirm(`Supprimer l'événement "${ev.title}" ?`)) return;
    try {
      const res = await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      announceNotified(await res.json());
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
    } catch { alert("Erreur lors de la suppression"); }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} événement(s) ?`)) return;
    try {
      const res = await fetch("/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }) });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      announceNotified(await res.json());
      setEvents((prev) => prev.filter((ev) => !selectedIds.has(ev.id)));
      setSelectedIds(new Set());
    } catch { alert("Erreur lors de la suppression"); }
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
      alert(`Planning dupliqué : ${result.copied} affectation(s) copiée(s) sur ${result.departments} département(s)`);
      setDuplicateModalOpen(false);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : "Erreur");
    } finally { setDuplicateLoading(false); }
  }

  const allSelected = filteredEvents.length > 0 && selectedIds.size === filteredEvents.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  let modalTitle = "Nouvel événement";
  if (seriesStep) modalTitle = "Modifier un événement récurrent";
  else if (editing) modalTitle = "Modifier l'événement";

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={openCreate}>Nouvel événement</Button>
        <div className="relative w-full sm:w-auto">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Rechercher..." className="w-full border border-control-line rounded-lg shadow-card pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-focus focus:border-brand focus:outline-none" />
        </div>
        <input type="month" value={monthFilter} onChange={(e) => handleMonthChange(e.target.value)} className="w-full sm:w-auto border border-control-line rounded-lg shadow-card px-3 py-2 text-sm focus:ring-2 focus:ring-focus focus:border-brand focus:outline-none capitalize" />
        {(monthFilter !== defaultMonth() || searchQuery) && (
          <button type="button" onClick={() => { handleMonthChange(defaultMonth()); handleSearchChange(""); }} className="text-sm text-ink-muted hover:text-ink-muted underline">
            Réinitialiser
          </button>
        )}
        <span className="ml-auto text-sm text-ink-subtle">{filteredEvents.length} événement{filteredEvents.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {/* Select all header */}
        {filteredEvents.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg border border-line">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-control-line text-brand-text focus:ring-focus"
            />
            <span className="text-xs text-ink-muted">Tout sélectionner</span>
          </div>
        )}

        {filteredEvents.length === 0 && (
          <div className="p-8 text-center text-ink-subtle border border-dashed border-line rounded-lg">
            {monthFilter || searchQuery ? "Aucun événement trouvé." : "Aucun événement."}
          </div>
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
            <div key={ev.id} className={`bg-surface rounded-lg border-2 transition-colors ${isSelected ? "border-brand/40 bg-brand-soft" : "border-line hover:border-line"}`}>
              <div className="flex items-start gap-3 p-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(ev.id)}
                  className="mt-3.5 h-4 w-4 shrink-0 rounded border-control-line text-brand-text focus:ring-focus"
                />

                {/* Date block */}
                <div className="bg-brand rounded-lg w-11 shrink-0 flex flex-col items-center justify-center py-2 mt-0.5">
                  <span className="text-[10px] font-semibold text-on-brand/80 uppercase leading-none">{weekday}</span>
                  <span className="text-xl font-black text-on-brand leading-none mt-0.5">{dayNum}</span>
                </div>

                {/* Content + Actions */}
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-2">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-ink text-sm">{ev.title}</span>
                      {isRecurrent && <span className="text-brand-text text-sm" title={recurrenceTitle}>↻</span>}
                      <StatusChip tone={eventTypeTone(ev.type)}>{getEventTypeLabel(ev.type)}</StatusChip>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">{dateLabel} {timeStr} — {ev.church.name}</p>
                    {ev.eventDepts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {ev.eventDepts.map((ed) => (
                          <span key={ed.department.id} className="text-[11px] bg-surface-sunken text-ink-muted px-2 py-0.5 rounded-full">
                            {ed.department.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1 shrink-0 justify-end items-center">
                    <Link href={`/events/${ev.id}/star-view`}>
                      <Button variant="secondary" size="sm">Planning</Button>
                    </Link>
                    {seriesParentId && seriesParentId !== ev.id && (
                      <Link href={`/admin/events/${seriesParentId}`}>
                        <Button variant="secondary" size="sm" title="Configurer toute la série">Série</Button>
                      </Link>
                    )}
                    <Link href={`/admin/events/${ev.id}`}>
                      <Button variant="secondary" size="sm">Config</Button>
                    </Link>
                    <Button variant="info" size="sm" onClick={() => openDuplicate(ev)} title="Dupliquer le planning">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    </Button>
                    <Button variant="edit" size="sm" onClick={() => openEdit(ev)} title="Modifier">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(ev)} title="Supprimer">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                    </Button>
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
        onDelete={handleBulkDelete}
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

            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>{loading ? "Enregistrement..." : "Enregistrer"}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Bulk edit modal */}
      <Modal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title={`Modifier ${selectedIds.size} événement(s)`}>
        <p className="text-sm text-ink-muted mb-4">Seuls les champs remplis seront modifiés.</p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input label="Titre" value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} placeholder="Laisser vide pour ne pas modifier" />
          <Select label="Type" value={bulkType} onChange={(e) => setBulkType(e.target.value)} options={EVENT_TYPE_OPTIONS} placeholder="Laisser vide pour ne pas modifier" />
          <Input label="Date" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          {bulkError && <p className="text-sm text-danger">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setBulkModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={bulkLoading}>{bulkLoading ? "Enregistrement..." : "Appliquer"}</Button>
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
          {duplicateError && <p className="text-sm text-danger">{duplicateError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDuplicateModalOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={duplicateLoading}>{duplicateLoading ? "Duplication..." : "Dupliquer"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
