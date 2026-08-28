"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/ui/DataTable";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel, getEventTypeBadge } from "@/lib/event-types";
import {
  type AudioServiceRow,
  type QueueCriteria,
  type SortState,
  DEFAULT_SORT,
  EMPTY_CRITERIA,
  NO_SPEAKER,
  deriveSpeakers,
  deriveYears,
  filterQueue,
  hasActiveState,
  isRangeValid,
  loadState,
  saveState,
  sortQueue,
} from "./queue-filters";

const SEARCH_DEBOUNCE_MS = 300;

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
      router.push(`/audio/production/${service.id}`);
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
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [criteria, setCriteria] = useState<QueueCriteria>(
    () => loadState()?.criteria ?? EMPTY_CRITERIA
  );
  const [sort, setSort] = useState<SortState>(() => loadState()?.sort ?? DEFAULT_SORT);

  // Champ de recherche local + débounce : on ne recalcule la file qu'après une pause
  // de frappe (même cadence que l'onglet (re)Écouter).
  const [searchText, setSearchText] = useState(criteria.text);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchText === criteria.text) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setCriteria((c) => ({ ...c, text: searchText })),
      SEARCH_DEBOUNCE_MS
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, criteria.text]);

  // Persistance intra-session (perdue au rechargement complet, cf. spec 023).
  useEffect(() => {
    saveState({ criteria, sort });
  }, [criteria, sort]);

  const speakers = useMemo(() => deriveSpeakers(services), [services]);
  const years = useMemo(() => deriveYears(services), [services]);

  const rangeValid = isRangeValid(criteria);
  const visible = useMemo(
    () => sortQueue(filterQueue(services, criteria), sort.key, sort.dir),
    [services, criteria, sort]
  );

  const activeFilterCount = (Object.keys(EMPTY_CRITERIA) as (keyof QueueCriteria)[]).filter(
    (k) => criteria[k] !== EMPTY_CRITERIA[k]
  ).length;
  const showReset = hasActiveState(criteria, sort) || searchText !== "";
  function reset() {
    setSearchText("");
    setCriteria(EMPTY_CRITERIA);
    setSort(DEFAULT_SORT);
  }

  function setField<K extends keyof QueueCriteria>(key: K, value: QueueCriteria[K]) {
    setCriteria((c) => ({ ...c, [key]: value }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="w-full md:flex-1">
          <div className="md:hidden mb-2">
            <Button variant="secondary" size="sm" onClick={() => setMobileFiltersOpen((o) => !o)}>
              Filtrer{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
          <div
            className={`${mobileFiltersOpen ? "grid" : "hidden"} md:grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`}
          >
          <Select
            label="Statut"
            placeholder="Tous les statuts"
            value={criteria.status}
            onChange={(e) => setField("status", e.target.value)}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Type"
            placeholder="Tous les types"
            value={criteria.type}
            onChange={(e) => setField("type", e.target.value)}
            options={EVENT_TYPE_OPTIONS}
          />
          {years.length > 0 && (
            <Select
              label="Année"
              placeholder="Toutes les années"
              value={criteria.year}
              onChange={(e) => setField("year", e.target.value)}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          )}
          <Input
            label="Du"
            type="date"
            value={criteria.from}
            onChange={(e) => setField("from", e.target.value)}
          />
          <Input
            label="Au"
            type="date"
            value={criteria.to}
            onChange={(e) => setField("to", e.target.value)}
          />
          <Select
            label="Orateur"
            placeholder="Tous les orateurs"
            value={criteria.speaker}
            onChange={(e) => setField("speaker", e.target.value)}
            options={[
              { value: NO_SPEAKER, label: "Sans orateur" },
              ...speakers.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Input
            label="Recherche"
            placeholder="Titre ou orateur…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>Déposer un enregistrement</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-gray-500">
        <span>
          {visible.length} enregistrement{visible.length > 1 ? "s" : ""}
        </span>
        {showReset && (
          <Button variant="secondary" size="sm" onClick={reset}>
            Réinitialiser
          </Button>
        )}
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
          {
            header: "Date",
            accessor: (row) => new Date(row.serviceDate).toLocaleDateString("fr-FR"),
            sortKey: "date",
          },
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
            sortKey: "status",
            defaultSortDir: "asc",
          },
          { header: "Séquences", accessor: (row) => row.segmentCount, sortKey: "segments" },
          { header: "Ouvertures", accessor: (row) => row.openCount, sortKey: "opens" },
        ]}
        data={visible}
        sort={sort}
        onSortChange={(s) => setSort({ key: s.key as SortState["key"], dir: s.dir })}
        emptyMessage={
          rangeValid
            ? "Aucun enregistrement ne correspond aux filtres."
            : "La date de fin est antérieure à la date de début."
        }
        actions={(row) => (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/audio/production/${row.id}`)}>
            Ouvrir
          </Button>
        )}
      />
    </div>
  );
}
