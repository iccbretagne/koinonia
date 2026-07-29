"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import DataTable from "@/components/ui/DataTable";
import ChecklistDetail, { type Checklist } from "./ChecklistDetail";

interface Room {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  isActive: boolean;
  isOwner: boolean;
  ownerChurch: { id: string; name: string };
}

interface Reservation {
  id: string;
  room: { id: string; name: string };
  title: string;
  startAt: string;
  endAt: string;
  status: "CONFIRMED" | "CANCELLED";
  seriesId: string | null;
  isRecurrenceParent: boolean;
  createdBy: { id: string; name: string | null };
  checklistStatus: "PENDING" | "OPENED" | "CLOSED_DECLARED" | "VALIDATED" | "ISSUE_REPORTED";
  checklist: Checklist | null;
}

interface KeyHolder {
  id: string;
  name: string | null;
  displayName: string | null;
}

const CHECKLIST_LABELS: Record<Reservation["checklistStatus"], string> = {
  PENDING: "Non ouverte",
  OPENED: "Ouverte",
  CLOSED_DECLARED: "Fermeture déclarée",
  VALIDATED: "Validée",
  ISSUE_REPORTED: "Écart signalé",
};

const CHECKLIST_BADGE: Record<Reservation["checklistStatus"], string> = {
  PENDING: "bg-gray-100 text-gray-600",
  OPENED: "bg-blue-100 text-blue-700",
  CLOSED_DECLARED: "bg-yellow-100 text-yellow-700",
  VALIDATED: "bg-green-100 text-green-700",
  ISSUE_REPORTED: "bg-red-100 text-red-700",
};

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(iso));
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: number; inMonth: boolean; dateStr: string }[] = [];

  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month - 1, -startDow + i + 1);
    days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month - 1, d);
    days.push({ date: d, inMonth: true, dateStr: localDateStr(dt) });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month, i);
      days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
    }
  }
  return days;
}

/** Actions disponibles sur une réservation, cohérentes avec ce que le serveur autorise réellement. */
function getAvailableActions(
  reservation: Reservation,
  { currentUserId, canManage }: { currentUserId: string; canManage: boolean }
) {
  const isOwner = reservation.createdBy.id === currentUserId;
  const canCancel = isOwner || canManage;
  return {
    canCancelOccurrence: canCancel,
    canCancelSeries: canCancel && !!reservation.seriesId,
    canDeclareOpen: isOwner && reservation.checklistStatus === "PENDING",
    canDeclareClose: isOwner && reservation.checklistStatus === "OPENED",
  };
}

// ─── Champ de saisie main courante (autocomplétion des utilisateurs) ─────────

function KeyPersonField({
  churchId,
  label,
  value,
  onChange,
}: {
  churchId: string;
  label: string;
  value: { id?: string; name: string };
  onChange: (v: { id?: string; name: string }) => void;
}) {
  const [results, setResults] = useState<KeyHolder[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const q = value.name.trim();
    if (q.length < 2 || value.id) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/rooms/key-holders?churchId=${churchId}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (res.ok) setResults(await res.json());
      } catch {
        // recherche annulée ou échouée — pas bloquant, l'utilisateur peut saisir un nom libre
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value.name, value.id, churchId]);

  function selectHolder(u: KeyHolder) {
    onChange({ id: u.id, name: u.displayName || u.name || "" });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={label}
        value={value.name}
        onChange={(e) => {
          onChange({ name: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nom (avec ou sans compte Koinonia)"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border-2 border-gray-200 rounded-lg shadow-md max-h-48 overflow-y-auto text-sm">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => selectHolder(u)}
                className="w-full text-left px-3 py-2 hover:bg-icc-violet-light"
              >
                {u.displayName || u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Vue calendrier par salle ────────────────────────────────────────────────

function RoomCalendarView({
  rooms,
  reservations,
  onSelect,
}: {
  rooms: Room[];
  reservations: Reservation[];
  onSelect: (reservation: Reservation) => void;
}) {
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const roomId = selectedRoomId || rooms[0]?.id || "";
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = currentMonth.split("-").map(Number);

  function navigateMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const reservationsByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (r.room.id !== roomId) continue;
      const dateStr = r.startAt.split("T")[0];
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(r);
    }
    return map;
  }, [reservations, roomId]);

  const days = useMemo(() => buildMonthDays(year, month), [year, month]);
  const todayStr = localDateStr(new Date());

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="w-full sm:w-64">
          <Select
            label="Salle"
            value={roomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            options={rooms.map((r) => ({
              value: r.id,
              label: r.isOwner ? r.name : `${r.name} (${r.ownerChurch.name})`,
            }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="px-3 py-2 text-base font-semibold text-icc-violet capitalize min-w-[10rem] text-center">
            {MONTHS_FR[month - 1]} {year}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune salle disponible.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 overflow-hidden">
          <div className="grid grid-cols-7 bg-icc-violet">
            {DAYS_FR.map((day) => (
              <div key={day} className="px-2 py-3 text-xs font-bold text-white text-center uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayReservations = reservationsByDate.get(day.dateStr) || [];
              const isToday = day.dateStr === todayStr;
              return (
                <div
                  key={idx}
                  className={`min-h-[90px] md:min-h-[110px] border-b border-r border-gray-100 p-1.5 ${
                    day.inMonth ? (isToday ? "bg-icc-violet-light/50" : "bg-white") : "bg-gray-50/50"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold mb-1 w-7 h-7 ${
                      isToday
                        ? "bg-icc-violet text-white rounded-full shadow-sm"
                        : day.inMonth
                          ? "text-gray-700"
                          : "text-gray-300"
                    }`}
                  >
                    {day.date}
                  </span>
                  <div className="space-y-1">
                    {dayReservations.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelect(r)}
                        title={`${r.title} — ${formatTime(r.startAt)} à ${formatTime(r.endAt)}`}
                        className="w-full text-left px-1.5 py-1 text-xs font-medium rounded-md bg-icc-violet/10 text-icc-violet truncate hover:bg-icc-violet/20 transition-colors"
                      >
                        {formatTime(r.startAt)} {r.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Détail d'une réservation (ouvert depuis le calendrier) ─────────────────

function ReservationDetailModal({
  reservation,
  currentUserId,
  canManage,
  onClose,
  onCancelOccurrence,
  onCancelSeries,
  onDeclareOpen,
  onDeclareClose,
}: {
  reservation: Reservation | null;
  currentUserId: string;
  canManage: boolean;
  onClose: () => void;
  onCancelOccurrence: (r: Reservation) => void;
  onCancelSeries: (r: Reservation) => void;
  onDeclareOpen: (r: Reservation) => void;
  onDeclareClose: (r: Reservation) => void;
}) {
  const actions = reservation ? getAvailableActions(reservation, { currentUserId, canManage }) : null;

  return (
    <Modal open={!!reservation} onClose={onClose} title={reservation?.title ?? "Réservation"}>
      {reservation && actions && (
        <div className="space-y-4">
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-gray-500">Salle</dt>
              <dd className="text-gray-900">{reservation.room.name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-gray-500">Début</dt>
              <dd className="text-gray-900">{formatDateTime(reservation.startAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-gray-500">Fin</dt>
              <dd className="text-gray-900">{formatDateTime(reservation.endAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-gray-500">Réservé par</dt>
              <dd className="text-gray-900">{reservation.createdBy.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between items-center gap-2">
              <dt className="font-medium text-gray-500">Main courante</dt>
              <dd>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${CHECKLIST_BADGE[reservation.checklistStatus]}`}
                >
                  {CHECKLIST_LABELS[reservation.checklistStatus]}
                </span>
              </dd>
            </div>
          </dl>

          <ChecklistDetail checklist={reservation.checklist} />

          {(actions.canDeclareOpen || actions.canDeclareClose || actions.canCancelOccurrence) && (
            <div className="flex gap-2 justify-end flex-wrap pt-3 border-t border-gray-100">
              {actions.canDeclareOpen && (
                <Button size="sm" variant="primary" onClick={() => onDeclareOpen(reservation)}>
                  Déclarer l&apos;ouverture
                </Button>
              )}
              {actions.canDeclareClose && (
                <Button size="sm" variant="primary" onClick={() => onDeclareClose(reservation)}>
                  Déclarer la fermeture
                </Button>
              )}
              {actions.canCancelOccurrence && (
                <Button size="sm" variant="danger" onClick={() => onCancelOccurrence(reservation)}>
                  Annuler
                </Button>
              )}
              {actions.canCancelSeries && (
                <Button size="sm" variant="secondary" onClick={() => onCancelSeries(reservation)}>
                  Annuler la série
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="secondary" onClick={onClose}>
              Retour
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function RoomsBookingClient({
  churchId,
  canReserve,
  canManage,
  currentUserId,
}: {
  churchId: string;
  canReserve: boolean;
  canManage: boolean;
  currentUserId: string;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("calendar");

  const [sortBy, setSortBy] = useState<"date" | "room">("date");
  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterChecklistStatus, setFilterChecklistStatus] = useState("");
  const [filterMine, setFilterMine] = useState(false);

  const [detailTarget, setDetailTarget] = useState<Reservation | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
  const [startAt, setStartAt] = useState(toLocalInputValue(defaultStart));
  const [endAt, setEndAt] = useState(toLocalInputValue(defaultEnd));
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const [checklistTarget, setChecklistTarget] = useState<{ reservation: Reservation; phase: "open" | "close" } | null>(null);
  const [keyPerson, setKeyPerson] = useState<{ id?: string; name: string }>({ name: "" });
  const [closedProperly, setClosedProperly] = useState(true);
  const [cleaned, setCleaned] = useState(true);
  const [equipmentOk, setEquipmentOk] = useState(true);
  const [equipmentNotes, setEquipmentNotes] = useState("");
  const [checklistNotes, setChecklistNotes] = useState("");

  const [cancelTarget, setCancelTarget] = useState<{ reservation: Reservation; scope: "occurrence" | "series" } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, reservationsRes] = await Promise.all([
        fetch(`/api/rooms?churchId=${churchId}`),
        fetch(`/api/room-reservations?churchId=${churchId}`),
      ]);
      if (roomsRes.ok) setRooms((await roomsRes.json()).rooms);
      if (reservationsRes.ok) setReservations((await reservationsRes.json()).reservations);
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => {
    load();
  }, [load]);

  function openForm() {
    setRoomId("");
    setTitle("");
    setRecurrenceRule("");
    setRecurrenceEnd("");
    setFormError(null);
    setConflictNotice(null);
    setFormOpen(true);
  }

  async function submitReservation() {
    setSubmitting(true);
    setFormError(null);
    setConflictNotice(null);
    try {
      const res = await fetch("/api/room-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          roomId,
          title,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          ...(recurrenceRule ? { recurrenceRule, recurrenceEnd: new Date(recurrenceEnd).toISOString() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur lors de la réservation");

      if (json.conflicts?.length > 0) {
        setConflictNotice(
          `${json.reservations.length} occurrence(s) créée(s), ${json.conflicts.length} en conflit ont été ignorée(s).`
        );
      } else {
        setFormOpen(false);
      }
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erreur lors de la réservation");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/room-reservations/${cancelTarget.reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", scope: cancelTarget.scope }),
      });
      if (res.ok) {
        setCancelTarget(null);
        await load();
      }
    } finally {
      setCancelling(false);
    }
  }

  function openChecklist(reservation: Reservation, phase: "open" | "close") {
    setChecklistTarget({ reservation, phase });
    setKeyPerson({ name: "" });
    setClosedProperly(true);
    setCleaned(true);
    setEquipmentOk(true);
    setEquipmentNotes("");
    setChecklistNotes("");
  }

  async function submitChecklist() {
    if (!checklistTarget) return;
    const { reservation, phase } = checklistTarget;
    const trimmedName = keyPerson.name.trim() || undefined;
    const body =
      phase === "open"
        ? {
            phase: "open",
            keyReceivedFromId: keyPerson.id,
            keyReceivedFromName: keyPerson.id ? undefined : trimmedName,
            notes: checklistNotes || undefined,
          }
        : {
            phase: "close",
            closedProperly,
            cleaned,
            equipmentOk,
            equipmentNotes: equipmentNotes || undefined,
            keyReturnedToId: keyPerson.id,
            keyReturnedToName: keyPerson.id ? undefined : trimmedName,
            notes: checklistNotes || undefined,
          };
    const res = await fetch(`/api/room-reservations/${reservation.id}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setChecklistTarget(null);
      await load();
    }
  }

  const activeReservations = reservations.filter((r) => r.status === "CONFIRMED");

  const displayedReservations = useMemo(() => {
    let list = activeReservations;
    if (filterMine) list = list.filter((r) => r.createdBy.id === currentUserId);
    if (filterRoomId) list = list.filter((r) => r.room.id === filterRoomId);
    if (filterChecklistStatus) list = list.filter((r) => r.checklistStatus === filterChecklistStatus);
    list = [...list].sort((a, b) =>
      sortBy === "room"
        ? a.room.name.localeCompare(b.room.name) || a.startAt.localeCompare(b.startAt)
        : a.startAt.localeCompare(b.startAt)
    );
    return list;
  }, [activeReservations, filterMine, currentUserId, filterRoomId, filterChecklistStatus, sortBy]);

  function handleCancelOccurrence(r: Reservation) {
    setDetailTarget(null);
    setCancelTarget({ reservation: r, scope: "occurrence" });
  }

  function handleCancelSeries(r: Reservation) {
    setDetailTarget(null);
    setCancelTarget({ reservation: r, scope: "series" });
  }

  function handleDeclareOpen(r: Reservation) {
    setDetailTarget(null);
    openChecklist(r, "open");
  }

  function handleDeclareClose(r: Reservation) {
    setDetailTarget(null);
    openChecklist(r, "close");
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="flex rounded-lg border-2 border-icc-violet/20 overflow-hidden">
          <button
            onClick={() => setView("calendar")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === "calendar" ? "bg-icc-violet text-white" : "bg-white text-icc-violet hover:bg-icc-violet-light"
            }`}
          >
            Calendrier par salle
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === "list" ? "bg-icc-violet text-white" : "bg-white text-icc-violet hover:bg-icc-violet-light"
            }`}
          >
            Liste
          </button>
        </div>
        {canReserve && (
          <Button onClick={openForm} disabled={rooms.length === 0}>
            Nouvelle réservation
          </Button>
        )}
      </div>

      {!loading && rooms.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Aucune salle disponible pour votre église pour le moment.</p>
      )}

      {view === "calendar" ? (
        <RoomCalendarView rooms={rooms} reservations={activeReservations} onSelect={setDetailTarget} />
      ) : (
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="w-full sm:w-48">
              <Select
                label="Trier par"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "date" | "room")}
                options={[
                  { value: "date", label: "Date" },
                  { value: "room", label: "Salle" },
                ]}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                label="Filtrer par salle"
                value={filterRoomId}
                onChange={(e) => setFilterRoomId(e.target.value)}
                placeholder="Toutes les salles"
                options={rooms.map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                label="Filtrer par main courante"
                value={filterChecklistStatus}
                onChange={(e) => setFilterChecklistStatus(e.target.value)}
                placeholder="Tous les statuts"
                options={Object.entries(CHECKLIST_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 sm:self-end sm:pb-2.5">
              <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} />
              Mes réservations uniquement
            </label>
          </div>

          <DataTable<Reservation>
            columns={[
              { header: "Salle", accessor: (r) => r.room.name },
              { header: "Titre", accessor: (r) => r.title },
              { header: "Début", accessor: (r) => formatDateTime(r.startAt) },
              { header: "Fin", accessor: (r) => formatDateTime(r.endAt) },
              { header: "Par", accessor: (r) => r.createdBy.name ?? "—" },
              {
                header: "Main courante",
                accessor: (r) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CHECKLIST_BADGE[r.checklistStatus]}`}>
                    {CHECKLIST_LABELS[r.checklistStatus]}
                  </span>
                ),
              },
            ]}
            data={displayedReservations}
            emptyMessage="Aucune réservation."
            actions={(r) => {
              const actions = getAvailableActions(r, { currentUserId, canManage });
              return (
                <div className="flex gap-2 justify-end flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => setDetailTarget(r)}>
                    Détails
                  </Button>
                  {actions.canDeclareOpen && (
                    <Button size="sm" variant="primary" onClick={() => openChecklist(r, "open")}>
                      Déclarer l&apos;ouverture
                    </Button>
                  )}
                  {actions.canDeclareClose && (
                    <Button size="sm" variant="primary" onClick={() => openChecklist(r, "close")}>
                      Déclarer la fermeture
                    </Button>
                  )}
                  {actions.canCancelOccurrence && (
                    <Button size="sm" variant="danger" onClick={() => setCancelTarget({ reservation: r, scope: "occurrence" })}>
                      Annuler
                    </Button>
                  )}
                  {actions.canCancelSeries && (
                    <Button size="sm" variant="secondary" onClick={() => setCancelTarget({ reservation: r, scope: "series" })}>
                      Annuler la série
                    </Button>
                  )}
                </div>
              );
            }}
          />
        </div>
      )}

      <ReservationDetailModal
        reservation={detailTarget}
        currentUserId={currentUserId}
        canManage={canManage}
        onClose={() => setDetailTarget(null)}
        onCancelOccurrence={handleCancelOccurrence}
        onCancelSeries={handleCancelSeries}
        onDeclareOpen={handleDeclareOpen}
        onDeclareClose={handleDeclareClose}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Nouvelle réservation">
        <div className="space-y-4">
          <Select
            label="Salle"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Choisir une salle…"
            options={rooms
              .filter((r) => r.isActive)
              .map((r) => ({
                value: r.id,
                label: r.isOwner ? r.name : `${r.name} (${r.ownerChurch.name})`,
              }))}
          />
          <Input label="Titre de l'activité" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Début" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <Input label="Fin" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <Select
            label="Récurrence (optionnel)"
            value={recurrenceRule}
            onChange={(e) => setRecurrenceRule(e.target.value)}
            placeholder="Aucune"
            options={[
              { value: "weekly", label: "Toutes les semaines" },
              { value: "biweekly", label: "Toutes les deux semaines" },
              { value: "monthly", label: "Tous les mois" },
            ]}
          />
          {recurrenceRule && (
            <Input
              label="Jusqu'au"
              type="date"
              value={recurrenceEnd}
              onChange={(e) => setRecurrenceEnd(e.target.value)}
            />
          )}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          {conflictNotice && <p className="text-xs text-yellow-700">{conflictNotice}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setFormOpen(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
              Annuler
            </button>
            <Button
              onClick={submitReservation}
              disabled={submitting || !roomId || !title || (!!recurrenceRule && !recurrenceEnd)}
            >
              {submitting ? "Réservation…" : "Réserver"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!checklistTarget}
        onClose={() => setChecklistTarget(null)}
        title={checklistTarget?.phase === "open" ? "Déclarer l'ouverture" : "Déclarer la fermeture"}
      >
        {checklistTarget && (
          <div className="space-y-4">
            {checklistTarget.phase === "close" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={closedProperly} onChange={(e) => setClosedProperly(e.target.checked)} />
                  Salle correctement fermée
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} />
                  Salle nettoyée
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={equipmentOk} onChange={(e) => setEquipmentOk(e.target.checked)} />
                  Salle/matériel en bon état
                </label>
                {!equipmentOk && (
                  <Textarea
                    label="Préciser le problème (dégât, matériel manquant/déplacé, panne)"
                    value={equipmentNotes}
                    onChange={(e) => setEquipmentNotes(e.target.value)}
                  />
                )}
              </div>
            )}
            <KeyPersonField
              churchId={churchId}
              label={checklistTarget.phase === "open" ? "Clés reçues de (optionnel)" : "Clés remises à (optionnel)"}
              value={keyPerson}
              onChange={setKeyPerson}
            />
            <Textarea label="Notes (optionnel)" value={checklistNotes} onChange={(e) => setChecklistNotes(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setChecklistTarget(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Annuler
              </button>
              <Button onClick={submitChecklist}>Confirmer</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!cancelTarget}
        title={cancelTarget?.scope === "series" ? "Annuler la série" : "Annuler la réservation"}
        message={
          cancelTarget?.scope === "series"
            ? `Toutes les occurrences futures de « ${cancelTarget.reservation.title} » seront annulées. Cette action est irréversible.`
            : `La réservation « ${cancelTarget?.reservation.title} » du ${cancelTarget ? formatDateTime(cancelTarget.reservation.startAt) : ""} sera annulée. Cette action est irréversible.`
        }
        confirmLabel="Annuler la réservation"
        confirming={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
