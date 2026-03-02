"use client";

import { useState } from "react";
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

  function openCreate() {
    setEditing(null);
    setTitle("");
    setType("");
    setDate("");
    setChurchId(churches[0]?.id || "");
    setPlanningDeadline("");
    setRecurrenceRule("");
    setRecurrenceEnd("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(ev: EventItem) {
    setEditing(ev);
    setTitle(ev.title);
    setType(ev.type);
    setDate(ev.date.split("T")[0]);
    setChurchId(ev.church.id);
    setPlanningDeadline(
      ev.planningDeadline
        ? new Date(ev.planningDeadline).toISOString().slice(0, 16)
        : ""
    );
    setRecurrenceRule("");
    setRecurrenceEnd("");
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          }
        : {
            title,
            type,
            date,
            churchId,
            planningDeadline: planningDeadline || null,
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

      if (editing) {
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
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={openCreate}>Nouvel événement</Button>
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
          data={events}
          emptyMessage="Aucun événement."
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          actions={(ev) => (
            <div className="flex gap-2 justify-end">
              <Link href={`/events/${ev.id}/star-view`}>
                <Button variant="secondary">Planning des STAR</Button>
              </Link>
              <Link href={`/admin/events/${ev.id}`}>
                <Button variant="secondary">Dép. en service</Button>
              </Link>
              <Button variant="secondary" onClick={() => openDuplicate(ev)}>
                Dupliquer planning
              </Button>
              <Button variant="secondary" onClick={() => openEdit(ev)}>
                Modifier
              </Button>
              <Button variant="danger" onClick={() => handleDelete(ev)}>
                Supprimer
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
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier l'événement" : "Nouvel événement"}
      >
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
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Input
            label="Date limite de planification"
            type="datetime-local"
            value={planningDeadline}
            onChange={(e) => setPlanningDeadline(e.target.value)}
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
