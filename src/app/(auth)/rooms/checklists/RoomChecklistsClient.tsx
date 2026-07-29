"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import DataTable from "@/components/ui/DataTable";
import ChecklistDetail, { type Checklist } from "../ChecklistDetail";

interface Reservation {
  id: string;
  room: { id: string; name: string };
  title: string;
  startAt: string;
  endAt: string;
  createdBy: { id: string; name: string | null };
  checklist: Checklist | null;
}

const STATUS_LABELS: Record<Checklist["status"], string> = {
  PENDING: "Non ouverte",
  OPENED: "Ouverte — en attente de fermeture",
  CLOSED_DECLARED: "Fermeture déclarée — à contrôler",
  VALIDATED: "Contrôlée — conforme",
  ISSUE_REPORTED: "Écart signalé",
};

const STATUS_BADGE: Record<Checklist["status"], string> = {
  PENDING: "bg-gray-100 text-gray-600",
  OPENED: "bg-blue-100 text-blue-700",
  CLOSED_DECLARED: "bg-yellow-100 text-yellow-700",
  VALIDATED: "bg-green-100 text-green-700",
  ISSUE_REPORTED: "bg-red-100 text-red-700",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** Réservation dont l'ouverture/fermeture n'a jamais été déclarée et déjà terminée. */
function isUndeclaredAndPastDue(r: Reservation): boolean {
  const status = r.checklist?.status ?? "PENDING";
  return (status === "PENDING" || status === "OPENED") && new Date(r.endAt) < new Date();
}

export default function RoomChecklistsClient({ initialReservations }: { initialReservations: Reservation[] }) {
  const [reservations, setReservations] = useState(initialReservations);
  const [target, setTarget] = useState<Reservation | null>(null);
  const [closedProperly, setClosedProperly] = useState(true);
  const [cleaned, setCleaned] = useState(true);
  const [validatedEquipmentOk, setValidatedEquipmentOk] = useState(true);
  const [incidentNotes, setIncidentNotes] = useState("");

  const [followUpTarget, setFollowUpTarget] = useState<{ reservation: Reservation; mode: "report-issue" | "close-manually" } | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);

  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCreatedById, setFilterCreatedById] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const roomOptions = useMemo(() => {
    const rooms = new Map<string, string>();
    for (const r of reservations) rooms.set(r.room.id, r.room.name);
    return Array.from(rooms, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [reservations]);

  const createdByOptions = useMemo(() => {
    const people = new Map<string, string>();
    for (const r of reservations) people.set(r.createdBy.id, r.createdBy.name ?? "—");
    return Array.from(people, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [reservations]);

  const displayedReservations = useMemo(() => {
    let list = reservations;
    if (filterRoomId) list = list.filter((r) => r.room.id === filterRoomId);
    if (filterStatus) list = list.filter((r) => (r.checklist?.status ?? "PENDING") === filterStatus);
    if (filterCreatedById) list = list.filter((r) => r.createdBy.id === filterCreatedById);
    if (filterFrom) list = list.filter((r) => r.startAt.slice(0, 10) >= filterFrom);
    if (filterTo) list = list.filter((r) => r.startAt.slice(0, 10) <= filterTo);
    return [...list].sort((a, b) =>
      sortOrder === "asc" ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt)
    );
  }, [reservations, filterRoomId, filterStatus, filterCreatedById, filterFrom, filterTo, sortOrder]);

  function openControl(reservation: Reservation) {
    setTarget(reservation);
    setClosedProperly(reservation.checklist?.closedProperly ?? true);
    setCleaned(reservation.checklist?.cleaned ?? true);
    setValidatedEquipmentOk(reservation.checklist?.equipmentOk ?? true);
    setIncidentNotes("");
  }

  function updateReservationChecklist(id: string, checklist: Partial<Checklist>) {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checklist: { ...(r.checklist as Checklist), ...checklist } } : r))
    );
  }

  async function submitValidation() {
    if (!target) return;
    const res = await fetch(`/api/room-reservations/${target.id}/checklist/validate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "validate",
        validatedClosedProperly: closedProperly,
        validatedCleaned: cleaned,
        validatedEquipmentOk,
        incidentNotes: incidentNotes || undefined,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      updateReservationChecklist(target.id, updated);
      setTarget(null);
    }
  }

  function openFollowUp(reservation: Reservation, mode: "report-issue" | "close-manually") {
    setFollowUpTarget({ reservation, mode });
    setFollowUpNotes("");
    setFollowUpError(null);
  }

  async function submitFollowUp() {
    if (!followUpTarget) return;
    if (followUpTarget.mode === "report-issue" && !followUpNotes.trim()) {
      setFollowUpError("Merci de décrire l'écart constaté.");
      return;
    }
    setFollowUpError(null);
    setFollowUpSubmitting(true);
    try {
      const body =
        followUpTarget.mode === "report-issue"
          ? { action: "report-issue", incidentNotes: followUpNotes.trim() }
          : { action: "close-manually", notes: followUpNotes.trim() || undefined };
      const res = await fetch(`/api/room-reservations/${followUpTarget.reservation.id}/checklist/validate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        updateReservationChecklist(followUpTarget.reservation.id, updated);
        setFollowUpTarget(null);
      }
    } finally {
      setFollowUpSubmitting(false);
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-56">
            <Select
              label="Filtrer par salle"
              value={filterRoomId}
              onChange={(e) => setFilterRoomId(e.target.value)}
              placeholder="Toutes les salles"
              options={roomOptions}
            />
          </div>
          <div className="w-full sm:w-64">
            <Select
              label="Filtrer par statut de main courante"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              placeholder="Tous les statuts"
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              label="Filtrer par responsable"
              value={filterCreatedById}
              onChange={(e) => setFilterCreatedById(e.target.value)}
              placeholder="Tous les responsables"
              options={createdByOptions}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex gap-2">
            <div className="w-1/2 sm:w-36">
              <Input label="Du" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="w-1/2 sm:w-36">
              <Input label="Au" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
          </div>
          <div className="w-full sm:w-52 sm:ml-auto">
            <Select
              label="Trier par date"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
              options={[
                { value: "desc", label: "Plus récentes d'abord" },
                { value: "asc", label: "Plus anciennes d'abord" },
              ]}
            />
          </div>
        </div>
      </div>

      <DataTable<Reservation>
        columns={[
          { header: "Salle", accessor: (r) => r.room.name },
          { header: "Titre", accessor: (r) => r.title },
          { header: "Créneau", accessor: (r) => `${formatDateTime(r.startAt)} → ${formatDateTime(r.endAt)}` },
          { header: "Responsable", accessor: (r) => r.createdBy.name ?? "—" },
          {
            header: "Main courante",
            accessor: (r) => (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[r.checklist?.status ?? "PENDING"]}`}
              >
                {STATUS_LABELS[r.checklist?.status ?? "PENDING"]}
              </span>
            ),
          },
        ]}
        data={displayedReservations}
        emptyMessage="Aucune main courante à contrôler."
        actions={(r) => (
          <div className="flex gap-2 justify-end flex-wrap">
            <Button size="sm" variant={r.checklist?.status === "CLOSED_DECLARED" ? "info" : "ghost"} onClick={() => openControl(r)}>
              {r.checklist?.status === "CLOSED_DECLARED" ? "Contrôler" : "Détails"}
            </Button>
            {isUndeclaredAndPastDue(r) && (
              <>
                <Button size="sm" variant="danger" onClick={() => openFollowUp(r, "report-issue")}>
                  Signaler un écart
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openFollowUp(r, "close-manually")}>
                  Clôturer sans déclaration
                </Button>
              </>
            )}
          </div>
        )}
      />

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.checklist?.status === "CLOSED_DECLARED" ? `Contrôle — ${target?.title ?? ""}` : `Détail — ${target?.title ?? ""}`}
      >
        {target && (
          <div className="space-y-4">
            <ChecklistDetail checklist={target.checklist} />

            {target.checklist?.status === "CLOSED_DECLARED" && (
              <>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={closedProperly} onChange={(e) => setClosedProperly(e.target.checked)} />
                    Constaté : salle correctement fermée
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} />
                    Constaté : salle nettoyée
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={validatedEquipmentOk}
                      onChange={(e) => setValidatedEquipmentOk(e.target.checked)}
                    />
                    Constaté : salle/matériel en bon état
                  </label>
                </div>
                <Textarea
                  label="Signaler un écart (optionnel)"
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                />
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setTarget(null)}>
                Retour
              </Button>
              {target.checklist?.status === "CLOSED_DECLARED" && <Button onClick={submitValidation}>Valider le contrôle</Button>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!followUpTarget}
        title={followUpTarget?.mode === "report-issue" ? "Signaler un écart" : "Clôturer sans déclaration"}
        message={
          followUpTarget?.mode === "report-issue"
            ? `La réservation « ${followUpTarget?.reservation.title} » est terminée sans déclaration d'ouverture/fermeture. Décrivez l'écart constaté ; le créateur sera notifié.`
            : `La réservation « ${followUpTarget?.reservation.title} » est terminée sans déclaration d'ouverture/fermeture. Elle sera clôturée manuellement, sans signalement ni notification.`
        }
        confirmLabel={followUpTarget?.mode === "report-issue" ? "Signaler l'écart" : "Clôturer"}
        variant={followUpTarget?.mode === "report-issue" ? "danger" : "primary"}
        confirming={followUpSubmitting}
        onConfirm={submitFollowUp}
        onCancel={() => setFollowUpTarget(null)}
      >
        <Textarea
          label={followUpTarget?.mode === "report-issue" ? "Écart constaté" : "Notes (optionnel)"}
          value={followUpNotes}
          onChange={(e) => setFollowUpNotes(e.target.value)}
          error={followUpError ?? undefined}
        />
      </ConfirmModal>
    </div>
  );
}
