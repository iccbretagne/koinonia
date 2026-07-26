"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/ui/DataTable";

interface Checklist {
  status: "PENDING" | "OPENED" | "CLOSED_DECLARED" | "VALIDATED" | "ISSUE_REPORTED";
  openedAt: string | null;
  keyReceivedFromName: string | null;
  openingNotes: string | null;
  closedAt: string | null;
  closedProperly: boolean | null;
  cleaned: boolean | null;
  keyReturnedToName: string | null;
  closingNotes: string | null;
  incidentNotes: string | null;
}

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

export default function RoomChecklistsClient({ initialReservations }: { initialReservations: Reservation[] }) {
  const [reservations, setReservations] = useState(initialReservations);
  const [target, setTarget] = useState<Reservation | null>(null);
  const [closedProperly, setClosedProperly] = useState(true);
  const [cleaned, setCleaned] = useState(true);
  const [incidentNotes, setIncidentNotes] = useState("");

  function openControl(reservation: Reservation) {
    setTarget(reservation);
    setClosedProperly(reservation.checklist?.closedProperly ?? true);
    setCleaned(reservation.checklist?.cleaned ?? true);
    setIncidentNotes("");
  }

  async function submitValidation() {
    if (!target) return;
    const res = await fetch(`/api/room-reservations/${target.id}/checklist/validate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        validatedClosedProperly: closedProperly,
        validatedCleaned: cleaned,
        incidentNotes: incidentNotes || undefined,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setReservations((prev) =>
        prev.map((r) =>
          r.id === target.id
            ? {
                ...r,
                checklist: {
                  ...r.checklist!,
                  status: updated.status,
                  validatedClosedProperly: updated.validatedClosedProperly,
                  validatedCleaned: updated.validatedCleaned,
                  incidentNotes: updated.incidentNotes,
                },
              }
            : r
        )
      );
      setTarget(null);
    }
  }

  return (
    <div>
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
        data={reservations}
        emptyMessage="Aucune main courante à contrôler."
        actions={(r) =>
          r.checklist?.status === "CLOSED_DECLARED" ? (
            <Button size="sm" variant="info" onClick={() => openControl(r)}>
              Contrôler
            </Button>
          ) : null
        }
      />

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Contrôle — ${target?.title ?? ""}`}>
        {target?.checklist && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
              <p>
                <span className="font-medium">Déclaré par l&apos;utilisateur :</span>{" "}
                {target.checklist.closedProperly ? "fermée correctement" : "non fermée correctement"},{" "}
                {target.checklist.cleaned ? "nettoyée" : "non nettoyée"}
              </p>
              {target.checklist.closingNotes && <p>Notes : {target.checklist.closingNotes}</p>}
              {target.checklist.keyReturnedToName && <p>Clés remises à : {target.checklist.keyReturnedToName}</p>}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={closedProperly} onChange={(e) => setClosedProperly(e.target.checked)} />
                Constaté : salle correctement fermée
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} />
                Constaté : salle nettoyée
              </label>
            </div>
            <Input
              label="Signaler un écart (optionnel)"
              value={incidentNotes}
              onChange={(e) => setIncidentNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTarget(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Annuler
              </button>
              <Button onClick={submitValidation}>Valider le contrôle</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
