"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";

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

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RoomsBookingClient({ churchId, canReserve }: { churchId: string; canReserve: boolean }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [keyPersonName, setKeyPersonName] = useState("");
  const [closedProperly, setClosedProperly] = useState(true);
  const [cleaned, setCleaned] = useState(true);
  const [checklistNotes, setChecklistNotes] = useState("");

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

  async function cancel(reservation: Reservation, scope: "occurrence" | "series") {
    const res = await fetch(`/api/room-reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", scope }),
    });
    if (res.ok) await load();
  }

  function openChecklist(reservation: Reservation, phase: "open" | "close") {
    setChecklistTarget({ reservation, phase });
    setKeyPersonName("");
    setClosedProperly(true);
    setCleaned(true);
    setChecklistNotes("");
  }

  async function submitChecklist() {
    if (!checklistTarget) return;
    const { reservation, phase } = checklistTarget;
    const body =
      phase === "open"
        ? { phase: "open", keyReceivedFromName: keyPersonName || undefined, notes: checklistNotes || undefined }
        : {
            phase: "close",
            closedProperly,
            cleaned,
            keyReturnedToName: keyPersonName || undefined,
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

  return (
    <div>
      {canReserve && (
        <div className="flex justify-end mb-4">
          <Button onClick={openForm} disabled={rooms.length === 0}>
            Nouvelle réservation
          </Button>
        </div>
      )}

      {!loading && rooms.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Aucune salle disponible pour votre église pour le moment.</p>
      )}

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
        data={activeReservations}
        emptyMessage="Aucune réservation."
        actions={(r) => (
          <div className="flex gap-2 justify-end flex-wrap">
            {r.checklistStatus === "PENDING" && (
              <Button size="sm" variant="info" onClick={() => openChecklist(r, "open")}>
                Déclarer l&apos;ouverture
              </Button>
            )}
            {r.checklistStatus === "OPENED" && (
              <Button size="sm" variant="info" onClick={() => openChecklist(r, "close")}>
                Déclarer la fermeture
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => cancel(r, "occurrence")}>
              Annuler
            </Button>
            {r.seriesId && (
              <Button size="sm" variant="ghost" onClick={() => cancel(r, "series")}>
                Annuler la série
              </Button>
            )}
          </div>
        )}
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
              </div>
            )}
            <Input
              label={checklistTarget.phase === "open" ? "Clés reçues de (optionnel)" : "Clés remises à (optionnel)"}
              value={keyPersonName}
              onChange={(e) => setKeyPersonName(e.target.value)}
            />
            <Input label="Notes (optionnel)" value={checklistNotes} onChange={(e) => setChecklistNotes(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setChecklistTarget(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Annuler
              </button>
              <Button onClick={submitChecklist}>Confirmer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
