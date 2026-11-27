"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmModal, Textarea, fieldLabelClasses } from "@/components/ui";
import AssigneeSelect, { type AssigneeValue } from "../../AssigneeSelect";

const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  ASSIGNED: { action: "contact", label: "Marquer contacté" },
  CONTACTED: { action: "in_formation", label: "Marquer en formation" },
  IN_FORMATION: { action: "complete", label: "Marquer terminé" },
  SUBMITTED: null,
  COMPLETED: null,
  ABANDONED: null,
};

interface Props {
  readonly followUpId: string;
  readonly churchId: string;
  readonly status: string;
  readonly isReferent: boolean;
  readonly isCurrentAssignee: boolean;
  readonly notes: string;
}

export default function FollowupActions({
  followUpId,
  churchId,
  status,
  isReferent,
  isCurrentAssignee,
  notes: initialNotes,
}: Props) {
  const router = useRouter();
  const uid = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [mode, setMode] = useState<"none" | "assign" | "reassign" | "handback">("none");
  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [handbackReason, setHandbackReason] = useState("");
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/followups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Erreur lors de l'enregistrement"); return; }
      setMode("none");
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  async function assignOrReassign(action: "assign" | "reassign") {
    if (!assignee) { setError("Veuillez sélectionner un référent."); return; }
    await patch({ action, assignee });
  }

  async function handback() {
    if (!handbackReason.trim()) { setError("Veuillez indiquer un motif."); return; }
    await patch({ action: "handback", reason: handbackReason.trim() });
  }

  const nextAction = NEXT_ACTION[status];
  const canAssign = isReferent && status === "SUBMITTED";
  const canReassign = isReferent && (status === "ASSIGNED" || status === "CONTACTED" || status === "IN_FORMATION");
  const canWorkflow = isCurrentAssignee && !!nextAction;
  const canAbandon = (isCurrentAssignee || isReferent) && status !== "COMPLETED" && status !== "ABANDONED";
  const canReopen = isReferent && status === "ABANDONED";
  const canHandback = isCurrentAssignee && (status === "ASSIGNED" || status === "CONTACTED" || status === "IN_FORMATION");
  const canNote = isCurrentAssignee || isReferent;

  // Une seule action principale à l'écran : l'étape suivante, sinon l'affectation, sinon la réouverture.
  const primary = canWorkflow ? "workflow" : canAssign || canReassign ? "assign" : canReopen ? "reopen" : null;
  const card = "flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card md:p-5";
  const footer = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
  const cancel = (
    <Button size="sm" variant="secondary" onClick={() => setMode("none")} disabled={loading}>
      Annuler
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {(canAssign || canReassign) && mode !== "none" && mode !== "handback" && (
        <section className={card}>
          <div>
            <label htmlFor={`${uid}-assignee`} className={`${fieldLabelClasses} mb-1.5 block`}>
              {canAssign ? "Référent" : "Nouveau référent"}
            </label>
            <AssigneeSelect id={`${uid}-assignee`} churchId={churchId} value={assignee} onChange={setAssignee} />
            {!assignee && <p className="mt-1.5 text-[13px] text-ink-muted">Choisissez un référent.</p>}
          </div>
          <div className={footer}>
            {cancel}
            <Button size="sm" disabled={loading || !assignee} onClick={() => assignOrReassign(mode)}>
              {loading ? "Enregistrement en cours…" : canAssign ? "Assigner le référent" : "Réaffecter le suivi"}
            </Button>
          </div>
        </section>
      )}

      {mode === "handback" && (
        <section className={card}>
          <Textarea
            id={`${uid}-handback`}
            label="Motif du retour au référent"
            required
            value={handbackReason}
            onChange={(e) => setHandbackReason(e.target.value)}
            rows={2}
            hint={handbackReason.trim() ? undefined : "Indiquez pourquoi vous rendez le suivi."}
          />
          <div className={footer}>
            {cancel}
            <Button size="sm" disabled={loading || !handbackReason.trim()} onClick={handback}>
              {loading ? "Enregistrement en cours…" : "Rendre au référent"}
            </Button>
          </div>
        </section>
      )}

      {mode === "none" && (canAssign || canReassign || canWorkflow || canHandback || canAbandon || canReopen) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canWorkflow && nextAction && (
            <Button size="sm" disabled={loading} onClick={() => patch({ action: nextAction.action })}>
              {nextAction.label}
            </Button>
          )}
          {(canAssign || canReassign) && (
            <Button
              size="sm"
              variant={primary === "assign" ? "primary" : "secondary"}
              disabled={loading}
              onClick={() => setMode(canAssign ? "assign" : "reassign")}
            >
              {canAssign ? "Assigner un référent" : "Réaffecter le suivi"}
            </Button>
          )}
          {canHandback && (
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => setMode("handback")}>
              Rendre au référent
            </Button>
          )}
          {canReopen && (
            <Button size="sm" variant={primary === "reopen" ? "primary" : "secondary"} disabled={loading} onClick={() => patch({ action: "reopen" })}>
              Rouvrir le suivi
            </Button>
          )}
          {canAbandon && (
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => setConfirmAbandon(true)}>
              Abandonner le suivi
            </Button>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmAbandon}
        title="Abandonner ce suivi ?"
        message="Le suivi passera à l'état « Abandonné ». Un référent pourra le rouvrir."
        confirmLabel="Abandonner le suivi"
        confirmingLabel="Abandon en cours…"
        variant="primary"
        confirming={loading}
        onConfirm={() => { setConfirmAbandon(false); void patch({ action: "abandon" }); }}
        onCancel={() => setConfirmAbandon(false)}
      />

      {canNote && (
        <section className={card}>
          <Textarea
            id={`${uid}-notes`}
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => patch({ action: "note", notes })}>
              {loading ? "Enregistrement en cours…" : "Enregistrer les notes"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
