"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import DataTable from "@/components/ui/DataTable";

interface Checklist {
  status: "PENDING" | "OPENED" | "CLOSED_DECLARED" | "VALIDATED" | "ISSUE_REPORTED";
  openedAt: string | null;
  keyReceivedFromName: string | null;
  openingNotes: string | null;
  closedAt: string | null;
  closedProperly: boolean | null;
  cleaned: boolean | null;
  equipmentOk: boolean | null;
  equipmentNotes: string | null;
  keyReturnedToName: string | null;
  closingNotes: string | null;
  incidentNotes: string | null;
  closedWithoutDeclaration: boolean;
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
        actions={(r) => (
          <div className="flex gap-2 justify-end flex-wrap">
            {r.checklist?.status === "CLOSED_DECLARED" && (
              <Button size="sm" variant="info" onClick={() => openControl(r)}>
                Contrôler
              </Button>
            )}
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

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Contrôle — ${target?.title ?? ""}`}>
        {target?.checklist && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
              <p>
                <span className="font-medium">Déclaré par l&apos;utilisateur :</span>{" "}
                {target.checklist.closedProperly ? "fermée correctement" : "non fermée correctement"},{" "}
                {target.checklist.cleaned ? "nettoyée" : "non nettoyée"},{" "}
                {target.checklist.equipmentOk ? "matériel en bon état" : "problème de matériel signalé"}
              </p>
              {target.checklist.equipmentNotes && <p>Matériel : {target.checklist.equipmentNotes}</p>}
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={validatedEquipmentOk}
                  onChange={(e) => setValidatedEquipmentOk(e.target.checked)}
                />
                Constaté : salle/matériel en bon état
              </label>
            </div>
            <Input
              label="Signaler un écart (optionnel)"
              value={incidentNotes}
              onChange={(e) => setIncidentNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setTarget(null)}>
                Retour
              </Button>
              <Button onClick={submitValidation}>Valider le contrôle</Button>
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
        <Input
          label={followUpTarget?.mode === "report-issue" ? "Écart constaté" : "Notes (optionnel)"}
          value={followUpNotes}
          onChange={(e) => setFollowUpNotes(e.target.value)}
          error={followUpError ?? undefined}
        />
      </ConfirmModal>
    </div>
  );
}
