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
import {
  addDays,
  buildMonthDays,
  buildWeekDays,
  cellKey,
  DAYS_FR,
  formatWeekLabel,
  getWeekStart,
  groupByRoomAndDay,
  localDateStr,
  MONTHS_FR,
} from "./calendar";

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
  const [fetched, setFetched] = useState<KeyHolder[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // La liste affichee est DERIVEE de la saisie : tant que la recherche n'a pas lieu d'etre, on
  // n'affiche rien sans avoir a reinitialiser l'etat depuis l'effet (rendus en cascade).
  const query = value.name.trim();
  const searchDisabled = query.length < 2 || !!value.id;
  const results = searchDisabled ? [] : fetched;

  useEffect(() => {
    if (searchDisabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/rooms/key-holders?churchId=${churchId}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (res.ok) setFetched(await res.json());
      } catch {
        // recherche annulée ou échouée — pas bloquant, l'utilisateur peut saisir un nom libre
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchDisabled, churchId]);

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

// ─── Pastille de réservation (partagée grille semaine / grille mois) ─────────

function ReservationChip({
  reservation,
  mine,
  showRoom,
  onSelect,
}: {
  reservation: Reservation;
  mine: boolean;
  showRoom?: boolean;
  onSelect: (r: Reservation) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(reservation)}
      title={`${reservation.room.name} — ${reservation.title} — ${formatTime(reservation.startAt)} à ${formatTime(reservation.endAt)}`}
      className={`w-full text-left px-1.5 py-1 text-xs font-medium rounded-md truncate transition-colors ${
        mine
          ? "bg-icc-violet text-white hover:bg-icc-violet/90"
          : "bg-icc-violet/10 text-icc-violet hover:bg-icc-violet/20"
      }`}
    >
      {formatTime(reservation.startAt)} {showRoom ? `· ${reservation.room.name} · ` : ""}
      {reservation.title}
    </button>
  );
}

// ─── Vue calendrier multi-salles (semaine ou mois) ─────────────────────────

/** Colonne « Salle » fixe + 7 colonnes de jour égales. */
const WEEK_GRID_COLS = "10rem repeat(7, minmax(0, 1fr))";

function RoomCalendarView({
  view,
  anchor,
  onNavigate,
  rooms,
  reservations,
  filterRoomId,
  onFilterRoomId,
  currentUserId,
  onSelect,
}: {
  view: "week" | "month";
  anchor: Date;
  onNavigate: (delta: number) => void;
  rooms: Room[];
  reservations: Reservation[];
  filterRoomId: string;
  onFilterRoomId: (id: string) => void;
  currentUserId: string;
  onSelect: (reservation: Reservation) => void;
}) {
  const days = useMemo(
    () =>
      view === "week"
        ? buildWeekDays(getWeekStart(anchor))
        : buildMonthDays(anchor.getFullYear(), anchor.getMonth() + 1),
    [view, anchor]
  );

  const label =
    view === "week"
      ? formatWeekLabel(getWeekStart(anchor))
      : `${MONTHS_FR[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const grouped = useMemo(() => groupByRoomAndDay(reservations), [reservations]);

  // Salles affichées : les actives, plus toute salle inactive portant une réservation dans
  // la période visible (une réservation ne doit pas disparaître si la salle est désactivée
  // entre-temps). Puis restriction éventuelle au filtre de salle.
  const displayedRooms = useMemo(() => {
    const periodDateStrs = new Set(days.map((d) => d.dateStr));
    const roomsWithReservation = new Set(
      reservations
        .filter((r) => periodDateStrs.has(localDateStr(new Date(r.startAt))))
        .map((r) => r.room.id)
    );
    let list = rooms.filter((r) => r.isActive || roomsWithReservation.has(r.id));
    if (filterRoomId) list = list.filter((r) => r.id === filterRoomId);
    return list;
  }, [rooms, reservations, days, filterRoomId]);

  const todayStr = localDateStr(new Date());

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="w-full sm:w-64">
          <Select
            label="Salle"
            value={filterRoomId}
            onChange={(e) => onFilterRoomId(e.target.value)}
            placeholder="Toutes les salles"
            options={rooms.map((r) => ({
              value: r.id,
              label: r.isOwner ? r.name : `${r.name} (${r.ownerChurch.name})`,
            }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate(-1)}
            aria-label="Période précédente"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="px-3 py-2 text-base font-semibold text-icc-violet capitalize min-w-[14rem] text-center">
            {label}
          </span>
          <button
            onClick={() => onNavigate(1)}
            aria-label="Période suivante"
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
      ) : view === "week" ? (
        <div className="overflow-x-auto bg-white rounded-xl shadow-md border-2 border-gray-100">
          <div className="min-w-[760px]">
            <div className="grid bg-icc-violet" style={{ gridTemplateColumns: WEEK_GRID_COLS }}>
              <div className="sticky left-0 z-20 bg-icc-violet px-3 py-3 text-xs font-bold text-white uppercase tracking-wider">
                Salle
              </div>
              {days.map((day) => (
                <div
                  key={day.dateStr}
                  className={`px-2 py-3 text-xs font-bold text-center uppercase tracking-wider ${
                    day.dateStr === todayStr ? "text-icc-jaune" : "text-white"
                  }`}
                >
                  {day.weekday} {day.dayNum}
                </div>
              ))}
            </div>

            {displayedRooms.length === 0 ? (
              <p className="px-3 py-6 text-sm text-gray-500">Aucune salle à afficher pour ce filtre.</p>
            ) : (
              displayedRooms.map((room) => (
                <div
                  key={room.id}
                  className="grid border-t border-gray-100"
                  style={{ gridTemplateColumns: WEEK_GRID_COLS }}
                >
                  <div className="sticky left-0 z-10 bg-white border-r border-gray-100 px-3 py-2">
                    <span className="text-sm font-medium text-gray-900">{room.name}</span>
                    {!room.isOwner && (
                      <span className="block text-[10px] text-gray-400">{room.ownerChurch.name}</span>
                    )}
                    {!room.isActive && <span className="block text-[10px] text-icc-rouge">désactivée</span>}
                  </div>
                  {days.map((day) => {
                    const cell = grouped.get(cellKey(room.id, day.dateStr)) ?? [];
                    return (
                      <div
                        key={day.dateStr}
                        className={`min-h-[64px] border-r border-gray-100 p-1 space-y-1 ${
                          day.dateStr === todayStr ? "bg-icc-violet-light/40" : ""
                        }`}
                      >
                        {cell.map((r) => (
                          <ReservationChip
                            key={r.id}
                            reservation={r}
                            mine={r.createdBy.id === currentUserId}
                            onSelect={onSelect}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
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
            {days.map((day) => {
              const cell = displayedRooms
                .flatMap((room) => grouped.get(cellKey(room.id, day.dateStr)) ?? [])
                .sort((a, b) => a.startAt.localeCompare(b.startAt));
              const isToday = day.dateStr === todayStr;
              return (
                <div
                  key={day.dateStr}
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
                    {day.dayNum}
                  </span>
                  <div className="space-y-1">
                    {cell.map((r) => (
                      <ReservationChip
                        key={r.id}
                        reservation={r}
                        mine={r.createdBy.id === currentUserId}
                        showRoom
                        onSelect={onSelect}
                      />
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
  const [view, setView] = useState<"week" | "month" | "list">("week");
  // Ancre de période unique aux deux vues calendaires : basculer semaine ↔ mois conserve
  // la période consultée au lieu de retomber sur le mois courant.
  const [anchor, setAnchor] = useState(() => new Date());
  const [myResaOpen, setMyResaOpen] = useState(true);

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
        // ponytail: charge tout l'historique de l'église à chaque montage alors que les
        // vues n'en affichent qu'une semaine ou un mois. Plafond préexistant, hors
        // périmètre spec 032. Voie de sortie : passer ?from=&to= (la route les accepte
        // déjà) le jour où le volume gêne.
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

  const activeReservations = useMemo(
    () => reservations.filter((r) => r.status === "CONFIRMED"),
    [reservations]
  );

  // Flèches de période : ±1 mois en vue mois, ±7 jours en vue semaine.
  const navigate = useCallback(
    (delta: number) =>
      setAnchor((a) =>
        view === "month"
          ? new Date(a.getFullYear(), a.getMonth() + delta, 1)
          : addDays(a, delta * 7)
      ),
    [view]
  );

  // Encart « Mes réservations » : dérivé de la seule identité de l'utilisateur, donc
  // indépendant de la vue et des filtres. Réservations non terminées, 4 affichées.
  const myUpcoming = activeReservations
    .filter((r) => r.createdBy.id === currentUserId && new Date(r.endAt).getTime() >= now.getTime())
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

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
      {myUpcoming.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-icc-violet/20 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setMyResaOpen((o) => !o)}
            aria-expanded={myResaOpen}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-icc-violet hover:bg-icc-violet-light transition-colors"
          >
            <span>Mes réservations ({myUpcoming.length})</span>
            <svg
              className={`w-4 h-4 transition-transform ${myResaOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {myResaOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {myUpcoming.slice(0, 4).map((r) => {
                const actions = getAvailableActions(r, { currentUserId, canManage });
                return (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(r.startAt)} · {r.room.name}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${CHECKLIST_BADGE[r.checklistStatus]}`}
                    >
                      {CHECKLIST_LABELS[r.checklistStatus]}
                    </span>
                    <div className="flex gap-2 shrink-0 flex-wrap">
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
                      <Button size="sm" variant="ghost" onClick={() => setDetailTarget(r)}>
                        Détails
                      </Button>
                    </div>
                  </div>
                );
              })}
              {myUpcoming.length > 4 && (
                <button
                  type="button"
                  onClick={() => {
                    setView("list");
                    setFilterMine(true);
                    setFilterRoomId("");
                    setFilterChecklistStatus("");
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-icc-violet hover:bg-icc-violet-light transition-colors"
                >
                  Voir mes {myUpcoming.length} réservations →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div className="flex rounded-lg border-2 border-icc-violet/20 overflow-hidden">
          {(
            [
              ["week", "Semaine"],
              ["month", "Mois"],
              ["list", "Liste"],
            ] as const
          ).map(([value, labelText]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === value ? "bg-icc-violet text-white" : "bg-white text-icc-violet hover:bg-icc-violet-light"
              }`}
            >
              {labelText}
            </button>
          ))}
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

      {view === "list" ? (
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
      ) : (
        <RoomCalendarView
          view={view}
          anchor={anchor}
          onNavigate={navigate}
          rooms={rooms}
          reservations={activeReservations}
          filterRoomId={filterRoomId}
          onFilterRoomId={setFilterRoomId}
          currentUserId={currentUserId}
          onSelect={setDetailTarget}
        />
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
