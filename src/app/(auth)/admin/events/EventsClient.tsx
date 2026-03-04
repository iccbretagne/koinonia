"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";
import BulkActionBar from "@/components/ui/BulkActionBar";

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
  initialEvents: EventItem[];
  churches: { id: string; name: string }[];
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

/** Format a Date or ISO string as YYYY-MM-DDTHH:mm in local timezone (for datetime-local inputs) */
function toLocalDatetime(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computeDeadline(eventDate: string, offset: string): string {
  if (!eventDate || !offset) return "";
  const match = offset.match(/^(\d+)(h|d)$/);
  if (!match) return "";

  const d = new Date(eventDate);
  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === "h") {
    d.setHours(d.getHours() - value);
  } else if (unit === "d") {
    d.setDate(d.getDate() - value);
  }

  return toLocalDatetime(d);
}

export default function EventsClient({ initialEvents, churches }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [churchId, setChurchId] = useState(churches[0]?.id || "");
  const [planningDeadline, setPlanningDeadline] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [deadlineOffset, setDeadlineOffset] = useState("2d");
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
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [seriesStep, setSeriesStep] = useState(false);
  const [seriesCount, setSeriesCount] = useState(0);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (monthFilter) {
      result = result.filter((e) => e.date.startsWith(monthFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          e.church.name.toLowerCase().includes(q) ||
          e.eventDepts.some((ed) => ed.department.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [events, monthFilter, searchQuery]);

  function getSeriesCount(ev: EventItem): number {
    const parentId = ev.isRecurrenceParent ? ev.id : ev.seriesId;
    if (!parentId) return 0;
    return events.filter(
      (e) => e.id === parentId || e.seriesId === parentId
    ).length;
  }

  function handleMonthChange(value: string) {
    setMonthFilter(value);
    setSelectedIds(new Set());
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setSelectedIds(new Set());
  }

  function openCreate() {
    setEditing(null);
    setTitle("");
    setType("");
    setDate("");
    setChurchId(churches[0]?.id || "");
    setPlanningDeadline("");
    setDeadlineOffset("2d");
    setRecurrenceRule("");
    setRecurrenceEnd("");
    setSeriesStep(false);
    setError("");
    setModalOpen(true);
  }

  function openEdit(ev: EventItem) {
    setEditing(ev);
    setTitle(ev.title);
    setType(ev.type);
    setDate(toLocalDatetime(ev.date));
    setChurchId(ev.church.id);
    setPlanningDeadline(
      ev.planningDeadline ? toLocalDatetime(ev.planningDeadline) : ""
    );
    setDeadlineOffset("");
    setRecurrenceRule("");
    setRecurrenceEnd("");
    setSeriesStep(false);
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // If editing a series event, show the series choice step within the same modal
    if (editing && (editing.seriesId || editing.isRecurrenceParent)) {
      setSeriesCount(getSeriesCount(editing));
      setSeriesStep(true);
      return;
    }

    await doSubmit(false);
  }

  async function doSubmit(applyToSeries: boolean) {
    setLoading(true);
    setError("");

    try {
      const url = editing ? `/api/events/${editing.id}` : "/api/events";
      const method = editing ? "PUT" : "POST";
      const body = editing
        ? {
            title,
            type,
            date,
            planningDeadline: planningDeadline || null,
            applyToSeries,
          }
        : {
            title,
            type,
            date,
            churchId,
            planningDeadline: planningDeadline || null,
            deadlineOffset: deadlineOffset || null,
            recurrenceRule: recurrenceRule || null,
            recurrenceEnd: recurrenceEnd || null,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      const saved = await res.json();

      if (editing && saved.seriesUpdated) {
        // Series was updated — reload full list
        const listRes = await fetch("/api/events");
        if (listRes.ok) {
          const allEvents = await listRes.json();
          setEvents(allEvents);
        }
      } else if (editing) {
        setEvents((prev) =>
          prev.map((ev) => (ev.id === saved.id ? saved : ev))
        );
      } else if (saved.childrenCreated) {
        // Recurrence: reload the full list to get all children
        const listRes = await fetch("/api/events");
        if (listRes.ok) {
          const allEvents = await listRes.json();
          setEvents(allEvents);
        }
      } else {
        setEvents((prev) => [saved, ...prev]);
      }

      setModalOpen(false);
      setSeriesStep(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ev: EventItem) {
    if (!confirm(`Supprimer l'événement "${ev.title}" ?`)) return;

    try {
      const res = await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} événement(s) ?`)) return;

    try {
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      setEvents((prev) => prev.filter((ev) => !selectedIds.has(ev.id)));
      setSelectedIds(new Set());
    } catch {
      alert("Erreur lors de la suppression");
    }
  }

  function openBulkEdit() {
    setBulkTitle("");
    setBulkType("");
    setBulkDate("");
    setBulkError("");
    setBulkModalOpen(true);
  }

  async function handleBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (bulkTitle) data.title = bulkTitle;
    if (bulkType) data.type = bulkType;
    if (bulkDate) data.date = bulkDate;

    if (Object.keys(data).length === 0) {
      setBulkError("Remplissez au moins un champ");
      return;
    }

    setBulkLoading(true);
    setBulkError("");

    try {
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "update", data }),
      });

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error || "Erreur");
      }

      setEvents((prev) =>
        prev.map((ev) => {
          if (!selectedIds.has(ev.id)) return ev;
          const updated = { ...ev };
          if (data.title) updated.title = data.title;
          if (data.type) updated.type = data.type;
          if (data.date) updated.date = new Date(data.date).toISOString();
          return updated;
        })
      );
      setSelectedIds(new Set());
      setBulkModalOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBulkLoading(false);
    }
  }

  function openDuplicate(ev: EventItem) {
    setDuplicateSourceId(ev.id);
    setDuplicateTargetId("");
    setDuplicateError("");
    setDuplicateModalOpen(true);
  }

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!duplicateTargetId) {
      setDuplicateError("Sélectionnez un événement cible");
      return;
    }
    setDuplicateLoading(true);
    setDuplicateError("");
    try {
      const res = await fetch(
        `/api/events/${duplicateSourceId}/duplicate-planning`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetEventId: duplicateTargetId }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }
      const result = await res.json();
      alert(
        `Planning dupliqué : ${result.copied} affectation(s) copiée(s) sur ${result.departments} département(s)`
      );
      setDuplicateModalOpen(false);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDuplicateLoading(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateStr} ${timeStr}`;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={openCreate}>Nouvel événement</Button>
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher..."
            className="border-2 border-gray-300 rounded-lg shadow-sm pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-icc-violet focus:border-icc-violet focus:outline-none"
          />
        </div>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="border-2 border-gray-300 rounded-lg shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-icc-violet focus:border-icc-violet focus:outline-none"
        />
        {(monthFilter || searchQuery) && (
          <button
            type="button"
            onClick={() => { handleMonthChange(""); handleSearchChange(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <DataTable
          columns={[
            {
              header: "Titre",
              accessor: (ev: EventItem) => (
                <span>
                  {ev.title}
                  {(ev.isRecurrenceParent || ev.seriesId) && (
                    <span className="ml-1 text-xs text-icc-violet" title="Événement récurrent">
                      ↻
                    </span>
                  )}
                </span>
              ),
            },
            { header: "Type", accessor: "type" },
            {
              header: "Date",
              accessor: (ev: EventItem) => formatDate(ev.date),
            },
            {
              header: "Église",
              accessor: (ev: EventItem) => ev.church.name,
            },
            {
              header: "Départements",
              accessor: (ev: EventItem) =>
                ev.eventDepts.length > 0
                  ? ev.eventDepts.map((ed) => ed.department.name).join(", ")
                  : "-",
            },
          ]}
          data={filteredEvents}
          emptyMessage={monthFilter || searchQuery ? "Aucun événement trouvé." : "Aucun événement."}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={(ev) => (
            <div className="flex gap-1.5 justify-end">
              <Link href={`/events/${ev.id}/star-view`}>
                <Button variant="secondary" size="sm">Planning STAR</Button>
              </Link>
              <Link href={`/admin/events/${ev.id}`}>
                <Button variant="secondary" size="sm">Dép. service</Button>
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
          )}
        />
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onEdit={openBulkEdit}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSeriesStep(false); }}
        title={
          seriesStep
            ? "Modifier un événement récurrent"
            : editing
              ? "Modifier l'événement"
              : "Nouvel événement"
        }
      >
        {seriesStep ? (
          <div>
            <p className="text-sm text-gray-600 mb-6">
              Cet événement fait partie d&apos;une série de{" "}
              <span className="font-semibold">{seriesCount} événement(s)</span>.
              Que souhaitez-vous modifier ?
            </p>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => doSubmit(false)}
                disabled={loading}
                variant="secondary"
              >
                {loading ? "Enregistrement..." : "Cet événement seul"}
              </Button>
              <Button
                onClick={() => doSubmit(true)}
                disabled={loading}
              >
                {loading
                  ? "Enregistrement..."
                  : `Toute la série (${seriesCount} événements)`}
              </Button>
              <button
                type="button"
                onClick={() => setSeriesStep(false)}
                className="text-sm text-gray-500 hover:text-gray-700 underline mt-1"
              >
                Retour au formulaire
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            />
            <Input
              label="Date et heure"
              type="datetime-local"
              value={date}
              onChange={(e) => {
                const newDate = e.target.value;
                setDate(newDate);
                if (deadlineOffset && newDate) {
                  setPlanningDeadline(computeDeadline(newDate, deadlineOffset));
                }
              }}
              required
            />
            <Select
              label="Délai avant l'événement"
              value={deadlineOffset}
              onChange={(e) => {
                const offset = e.target.value;
                setDeadlineOffset(offset);
                if (offset && date) {
                  setPlanningDeadline(computeDeadline(date, offset));
                }
              }}
              options={DEADLINE_OFFSETS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <Input
              label="Date limite de planification"
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => {
                setPlanningDeadline(e.target.value);
                setDeadlineOffset("");
              }}
            />
            {!editing && (
              <>
                <Select
                  label="Église"
                  value={churchId}
                  onChange={(e) => setChurchId(e.target.value)}
                  options={churches.map((c) => ({ value: c.id, label: c.name }))}
                />
                <Select
                  label="Récurrence"
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value)}
                  options={[
                    { value: "weekly", label: "Hebdomadaire" },
                    { value: "biweekly", label: "Bi-hebdomadaire" },
                    { value: "monthly", label: "Mensuel" },
                  ]}
                  placeholder="Aucune (événement unique)"
                />
                {recurrenceRule && (
                  <Input
                    label="Fin de récurrence"
                    type="date"
                    value={recurrenceEnd}
                    onChange={(e) => setRecurrenceEnd(e.target.value)}
                    required
                  />
                )}
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={`Modifier ${selectedIds.size} événement(s)`}
      >
        <p className="text-sm text-gray-500 mb-4">
          Seuls les champs remplis seront modifiés.
        </p>
        <form onSubmit={handleBulkEdit} className="space-y-4">
          <Input
            label="Titre"
            value={bulkTitle}
            onChange={(e) => setBulkTitle(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Input
            label="Type"
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value)}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <Input
            label="Date"
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
          />
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setBulkModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={bulkLoading}>
              {bulkLoading ? "Enregistrement..." : "Appliquer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="Dupliquer un planning"
      >
        <p className="text-sm text-gray-500 mb-4">
          Copier les affectations de l&apos;événement source vers un événement cible.
          Seuls les départements communs seront dupliqués.
        </p>
        <form onSubmit={handleDuplicate} className="space-y-4">
          <Select
            label="Événement cible"
            value={duplicateTargetId}
            onChange={(e) => setDuplicateTargetId(e.target.value)}
            placeholder="Choisir l'événement cible"
            options={events
              .filter((ev) => ev.id !== duplicateSourceId)
              .map((ev) => ({
                value: ev.id,
                label: `${ev.title} (${formatDate(ev.date)})`,
              }))}
          />
          {duplicateError && (
            <p className="text-sm text-red-600">{duplicateError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setDuplicateModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={duplicateLoading}>
              {duplicateLoading ? "Duplication..." : "Dupliquer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
