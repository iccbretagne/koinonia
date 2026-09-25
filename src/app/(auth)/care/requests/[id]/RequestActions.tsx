"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import AssigneeSelect, { type AssigneeValue } from "../../AssigneeSelect";

const REJECT_REASON_OPTIONS: [string, string][] = [
  ["OUT_OF_SCOPE", "Hors du champ pastoral"],
  ["DUPLICATE", "Doublon"],
  ["WITHDRAWN", "Demande retirée par la personne"],
  ["UNREACHABLE", "Injoignable"],
  ["REDIRECTED", "Orientée vers un autre service"],
  ["OTHER", "Autre"],
];

const OUTCOME_OPTIONS: [string, string][] = [
  ["HELD", "Rendez-vous tenu"],
  ["REFERRED_TO_FOLLOWUP", "Orienté vers un suivi de nouveau converti"],
  ["NO_SHOW_CLOSE", "Ne s'est pas présenté — clôturer"],
  ["NEW_APPOINTMENT", "Reprendre un nouveau rendez-vous"],
  ["NO_SHOW_REPLAN", "Ne s'est pas présenté — replanifier"],
];

interface Props {
  readonly requestId: string;
  readonly churchId: string;
  readonly status: string;
  readonly isReferent: boolean;
  readonly isCurrentAssignee: boolean;
  readonly isMemberAssignee: boolean;
  /** Le référent peut renseigner le compte rendu à la place d'un profil pastoral sans compte. */
  readonly canActAsAssigneeProxy: boolean;
}

async function patch(requestId: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/care/requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json();
    return d.error ?? "Erreur";
  }
  return null;
}

export default function RequestActions({
  requestId,
  churchId,
  status,
  isReferent,
  isCurrentAssignee,
  isMemberAssignee,
  canActAsAssigneeProxy,
}: Props) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<
    "none" | "validate" | "reject" | "reassign" | "set_date" | "outcome" | "handback"
  >("none");

  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [outcomeKind, setOutcomeKind] = useState("");
  const [handbackReason, setHandbackReason] = useState("");

  async function run(body: unknown) {
    setProcessing(true);
    setError(null);
    const err = await patch(requestId, body);
    if (err) { setError(err); setProcessing(false); return; }
    setMode("none");
    router.refresh();
    setProcessing(false);
  }

  async function validate() {
    if (!assignee) { setError("Veuillez sélectionner un accompagnant."); return; }
    await run({ action: "validate", assignee, note: note || undefined });
  }

  async function reject() {
    if (!reasonCode) { setError("Veuillez sélectionner un motif."); return; }
    if (!confirm("Rejeter définitivement cette demande ?")) return;
    await run({ action: "reject", reasonCode, comment: comment || undefined });
  }

  async function reassign() {
    if (!assignee) { setError("Veuillez sélectionner un accompagnant."); return; }
    await run({ action: "reassign", assignee });
  }

  async function setDate() {
    if (!scheduledFor) { setError("Veuillez indiquer une date."); return; }
    await run({ action: "set_date", scheduledFor: new Date(scheduledFor).toISOString() });
  }

  async function outcome() {
    if (!outcomeKind) { setError("Veuillez sélectionner un résultat."); return; }
    await run({ action: "outcome", kind: outcomeKind });
  }

  async function handback() {
    if (!handbackReason.trim()) { setError("Veuillez indiquer un motif."); return; }
    await run({ action: "handback", reason: handbackReason.trim() });
  }

  const canValidateOrReject = isReferent && status === "PENDING";
  const canReassign = isReferent && (status === "VALIDATED" || status === "SCHEDULED");
  const canSetDate = isMemberAssignee && isCurrentAssignee && status === "VALIDATED";
  const canOutcome = (isCurrentAssignee || canActAsAssigneeProxy) && status === "SCHEDULED";
  const canHandback = isCurrentAssignee && (status === "VALIDATED" || status === "SCHEDULED");

  if (!canValidateOrReject && !canReassign && !canSetDate && !canOutcome && !canHandback) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode === "none" && (
        <div className="flex flex-wrap gap-2">
          {canValidateOrReject && (
            <>
              <Button size="sm" onClick={() => setMode("validate")}>✓ Confier</Button>
              <Button size="sm" variant="danger" onClick={() => setMode("reject")}>Rejeter</Button>
            </>
          )}
          {canReassign && <Button size="sm" variant="info" onClick={() => setMode("reassign")}>Réaffecter</Button>}
          {canSetDate && <Button size="sm" variant="info" onClick={() => setMode("set_date")}>Fixer la date</Button>}
          {canOutcome && <Button size="sm" variant="info" onClick={() => setMode("outcome")}>Compte rendu du rendez-vous</Button>}
          {canHandback && <Button size="sm" variant="secondary" onClick={() => setMode("handback")}>Rendre au référent</Button>}
        </div>
      )}

      {mode === "validate" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Accompagnant <span className="text-red-500">*</span>
            </label>
            <AssigneeSelect churchId={churchId} value={assignee} onChange={setAssignee} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note transmise à l&apos;accompagnant (optionnel)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={validate} disabled={processing}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motif de refus <span className="text-red-500">*</span>
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {REJECT_REASON_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Commentaire (optionnel)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={reject} disabled={processing}>Confirmer le refus</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === "reassign" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nouvel accompagnant <span className="text-red-500">*</span>
            </label>
            <AssigneeSelect churchId={churchId} value={assignee} onChange={setAssignee} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={reassign} disabled={processing}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === "set_date" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date et heure du rendez-vous <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={setDate} disabled={processing}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === "outcome" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Compte rendu du rendez-vous <span className="text-red-500">*</span>
            </label>
            <select
              value={outcomeKind}
              onChange={(e) => setOutcomeKind(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {OUTCOME_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={outcome} disabled={processing}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === "handback" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motif du retour au référent <span className="text-red-500">*</span>
            </label>
            <textarea
              value={handbackReason}
              onChange={(e) => setHandbackReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={handback} disabled={processing}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}
