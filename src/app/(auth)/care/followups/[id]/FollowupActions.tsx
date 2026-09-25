"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [mode, setMode] = useState<"none" | "assign" | "reassign" | "handback">("none");
  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [handbackReason, setHandbackReason] = useState("");

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/followups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erreur"); return; }
      setMode("none");
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  async function assignOrReassign(action: "assign" | "reassign") {
    if (!assignee) { setError("Veuillez sélectionner un accompagnant."); return; }
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

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {(canAssign || canReassign) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {mode === "assign" || mode === "reassign" ? (
            <div className="space-y-3">
              <AssigneeSelect churchId={churchId} value={assignee} onChange={setAssignee} />
              <div className="flex gap-2">
                <Button size="sm" disabled={loading} onClick={() => assignOrReassign(mode)}>Confirmer</Button>
                <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setMode(canAssign ? "assign" : "reassign")}>
              {canAssign ? "Assigner un accompagnant" : "Réaffecter"}
            </Button>
          )}
        </div>
      )}

      {canWorkflow && nextAction && (
        <Button size="sm" disabled={loading} onClick={() => patch({ action: nextAction.action })}>
          {nextAction.label}
        </Button>
      )}

      {canHandback && mode !== "handback" && (
        <Button size="sm" variant="secondary" disabled={loading} onClick={() => setMode("handback")}>
          Rendre au référent
        </Button>
      )}
      {mode === "handback" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Motif du retour au référent <span className="text-red-500">*</span>
          </label>
          <textarea
            value={handbackReason}
            onChange={(e) => setHandbackReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={loading} onClick={handback}>Confirmer</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("none")}>Annuler</Button>
          </div>
        </div>
      )}

      {canAbandon && (
        <Button size="sm" variant="danger" disabled={loading}
          onClick={() => { if (confirm("Abandonner ce suivi ?")) patch({ action: "abandon" }); }}>
          Abandonner
        </Button>
      )}

      {canReopen && (
        <Button size="sm" disabled={loading} onClick={() => patch({ action: "reopen" })}>
          Rouvrir
        </Button>
      )}

      {canNote && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
          />
          <Button size="sm" className="mt-2" disabled={loading} onClick={() => patch({ action: "note", notes })}>
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
