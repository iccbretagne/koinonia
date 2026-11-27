"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmModal, Input, Select, Textarea, fieldLabelClasses } from "@/components/ui";
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
    const d = await res.json().catch(() => ({}));
    return d.error ?? "Erreur lors de l'enregistrement";
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
  const id = useId();
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
  const [confirmReject, setConfirmReject] = useState(false);

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
    if (!assignee) { setError("Veuillez sélectionner un référent."); return; }
    await run({ action: "validate", assignee, note: note || undefined });
  }

  async function reject() {
    setConfirmReject(false);
    if (!reasonCode) { setError("Veuillez sélectionner un motif."); return; }
    await run({ action: "reject", reasonCode, comment: comment || undefined });
  }

  async function reassign() {
    if (!assignee) { setError("Veuillez sélectionner un référent."); return; }
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

  const cancel = (
    <Button size="sm" variant="secondary" onClick={() => { setMode("none"); setError(null); }} disabled={processing}>
      Annuler
    </Button>
  );
  const footerClasses = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
  const sending = processing ? "Enregistrement en cours…" : null;

  return (
    <section className="flex flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {mode === "none" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canValidateOrReject && (
            <>
              <Button size="sm" onClick={() => setMode("validate")}>Confier la demande</Button>
              <Button size="sm" variant="secondary" onClick={() => setMode("reject")}>Refuser la demande</Button>
            </>
          )}
          {canReassign && <Button size="sm" variant="secondary" onClick={() => setMode("reassign")}>Réaffecter la demande</Button>}
          {canSetDate && <Button size="sm" variant="secondary" onClick={() => setMode("set_date")}>Fixer la date</Button>}
          {canOutcome && <Button size="sm" variant="secondary" onClick={() => setMode("outcome")}>Renseigner le compte rendu</Button>}
          {canHandback && <Button size="sm" variant="secondary" onClick={() => setMode("handback")}>Rendre la demande</Button>}
        </div>
      )}

      {mode === "validate" && (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor={`${id}-f1`} className={`${fieldLabelClasses} mb-1.5 block`}>Référent</label>
            <AssigneeSelect id={`${id}-f1`} churchId={churchId} value={assignee} onChange={setAssignee} />
            {!assignee && <p className="mt-1.5 text-[13px] text-ink-muted">Choisissez un référent pour confier la demande.</p>}
          </div>
          <Textarea
            id={`${id}-f2`}
            label="Note transmise au référent (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={validate} disabled={processing || !assignee}>
              {sending ?? "Confier la demande"}
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-col gap-3">
          <Select
            id={`${id}-f3`}
            label="Motif de refus"
            required
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="Choisir un motif…"
            options={REJECT_REASON_OPTIONS.map(([value, label]) => ({ value, label }))}
            hint={reasonCode ? undefined : "Choisissez un motif pour refuser la demande."}
          />
          <Textarea
            id={`${id}-f4`}
            label="Commentaire (facultatif)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={() => setConfirmReject(true)} disabled={processing || !reasonCode}>
              Refuser la demande
            </Button>
          </div>
          <ConfirmModal
            open={confirmReject}
            title="Refuser cette demande ?"
            message="Le refus est définitif : la demande ne pourra plus être confiée."
            confirmLabel="Refuser la demande"
            confirmingLabel="Refus en cours…"
            variant="primary"
            confirming={processing}
            onConfirm={reject}
            onCancel={() => setConfirmReject(false)}
          />
        </div>
      )}

      {mode === "reassign" && (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor={`${id}-f5`} className={`${fieldLabelClasses} mb-1.5 block`}>Nouveau référent</label>
            <AssigneeSelect id={`${id}-f5`} churchId={churchId} value={assignee} onChange={setAssignee} />
            {!assignee && <p className="mt-1.5 text-[13px] text-ink-muted">Choisissez le nouveau référent.</p>}
          </div>
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={reassign} disabled={processing || !assignee}>
              {sending ?? "Réaffecter la demande"}
            </Button>
          </div>
        </div>
      )}

      {mode === "set_date" && (
        <div className="flex flex-col gap-3">
          <Input
            id={`${id}-f6`}
            label="Date et heure du rendez-vous"
            type="datetime-local"
            required
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            hint={scheduledFor ? undefined : "Indiquez la date et l'heure convenues."}
          />
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={setDate} disabled={processing || !scheduledFor}>
              {sending ?? "Fixer la date"}
            </Button>
          </div>
        </div>
      )}

      {mode === "outcome" && (
        <div className="flex flex-col gap-3">
          <Select
            id={`${id}-f7`}
            label="Compte rendu du rendez-vous"
            required
            value={outcomeKind}
            onChange={(e) => setOutcomeKind(e.target.value)}
            placeholder="Choisir un résultat…"
            options={OUTCOME_OPTIONS.map(([value, label]) => ({ value, label }))}
            hint={outcomeKind ? undefined : "Choisissez le résultat du rendez-vous."}
          />
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={outcome} disabled={processing || !outcomeKind}>
              {sending ?? "Enregistrer le compte rendu"}
            </Button>
          </div>
        </div>
      )}

      {mode === "handback" && (
        <div className="flex flex-col gap-3">
          <Textarea
            id={`${id}-f8`}
            label="Motif du retour"
            required
            value={handbackReason}
            onChange={(e) => setHandbackReason(e.target.value)}
            rows={2}
            hint={handbackReason.trim() ? undefined : "Indiquez pourquoi vous rendez la demande."}
          />
          <div className={footerClasses}>
            {cancel}
            <Button size="sm" onClick={handback} disabled={processing || !handbackReason.trim()}>
              {sending ?? "Rendre la demande"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
