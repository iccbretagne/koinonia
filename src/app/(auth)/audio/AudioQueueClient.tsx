"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/ui/DataTable";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel, getEventTypeBadge } from "@/lib/event-types";

interface AudioServiceRow {
  id: string;
  title: string | null;
  speaker: string | null;
  serviceDate: string;
  status: "DRAFT" | "PENDING_REVIEW" | "READY" | "PUBLISHED" | "UNPUBLISHED";
  type: string;
  openCount: number;
  segmentCount: number;
  eventTitle: string | null;
}

const STATUS_LABELS: Record<AudioServiceRow["status"], string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À nommer",
  READY: "Rendu en cours",
  PUBLISHED: "Publié",
  UNPUBLISHED: "Dépublié",
};

const STATUS_BADGE: Record<AudioServiceRow["status"], string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  READY: "bg-icc-bleu/10 text-icc-bleu",
  PUBLISHED: "bg-green-100 text-green-800",
  UNPUBLISHED: "bg-red-100 text-red-800",
};

interface DayEvent {
  id: string;
  title: string;
  date: string;
  hasAudioService: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function NewServiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [type, setType] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEventId("");
    fetch(`/api/audio/services/events?date=${date}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DayEvent[]) => setDayEvents(data))
      .catch(() => setDayEvents([]));
  }, [open, date]);

  // Un événement rattaché impose son type (dérivé côté serveur) — le champ passe en lecture
  // seule pour ne pas laisser croire qu'une saisie ici aurait un effet.
  const linkedToEvent = !!eventId;

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/audio/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planningEventId: eventId || undefined,
          serviceDate: new Date(date).toISOString(),
          title: title.trim() || undefined,
          speaker: speaker.trim() || undefined,
          type: linkedToEvent ? undefined : type || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la création");
      }
      const service = await res.json();
      router.push(`/audio/${service.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Déposer un enregistrement">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="Événement"
          placeholder={dayEvents.length === 0 ? "Aucun événement ce jour — saisie libre" : "Aucun — saisie libre"}
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            const evt = dayEvents.find((d) => d.id === e.target.value);
            if (evt) setTitle(evt.title);
          }}
          options={dayEvents.map((e) => {
            const label = `${e.title} — ${new Date(e.date).toLocaleDateString("fr-FR")}`;
            return { value: e.id, label: e.hasAudioService ? `${label} (déjà déposé)` : label };
          })}
        />
        <Select
          label="Type de rassemblement"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={EVENT_TYPE_OPTIONS}
          disabled={linkedToEvent}
          placeholder={linkedToEvent ? "Déterminé par l'événement rattaché" : "Sélectionner..."}
        />
        <Input
          label="Titre du message"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. : Marcher par la foi"
        />
        <Input
          label="Orateur"
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          placeholder="Ex. : Pasteur..."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={creating}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={creating}>
            {creating ? "Création..." : "Créer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function AudioQueueClient({ services }: { services: AudioServiceRow[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () => (statusFilter ? services.filter((s) => s.status === statusFilter) : services),
    [services, statusFilter]
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="w-full max-w-xs">
          <Select
            label="Statut"
            placeholder="Tous les statuts"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <Button onClick={() => setModalOpen(true)}>Déposer un enregistrement</Button>
      </div>
      <NewServiceModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <DataTable
        columns={[
          {
            header: "Enregistrement",
            accessor: (row) => (
              <div>
                <div className="font-medium text-gray-900">
                  {row.title || row.eventTitle || new Date(row.serviceDate).toLocaleDateString("fr-FR")}
                </div>
                {row.speaker && <div className="text-xs text-gray-500">{row.speaker}</div>}
              </div>
            ),
          },
          { header: "Date", accessor: (row) => new Date(row.serviceDate).toLocaleDateString("fr-FR") },
          {
            header: "Type",
            accessor: (row) => (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEventTypeBadge(row.type)}`}>
                {getEventTypeLabel(row.type)}
              </span>
            ),
          },
          {
            header: "Statut",
            accessor: (row) => (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                {STATUS_LABELS[row.status]}
              </span>
            ),
          },
          { header: "Séquences", accessor: (row) => row.segmentCount },
          { header: "Ouvertures", accessor: (row) => row.openCount },
        ]}
        data={filtered}
        emptyMessage="Aucun enregistrement audio."
        actions={(row) => (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/audio/${row.id}`)}>
            Ouvrir
          </Button>
        )}
      />
    </div>
  );
}
