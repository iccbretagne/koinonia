"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

interface Counselor { id: string; name: string | null; email: string | null }

const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  ASSIGNED: { action: "contact", label: "Marquer contacté" },
  CONTACTED: { action: "in_formation", label: "Marquer en formation" },
  IN_FORMATION: { action: "complete", label: "Marquer terminé" },
  SUBMITTED: null,
  COMPLETED: null,
  ABANDONED: null,
};

export default function FollowupActions({ followUpId, churchId, status, isManager, notes: initialNotes }: {
  readonly followUpId: string;
  readonly churchId: string;
  readonly status: string;
  readonly isManager: boolean;
  readonly notes: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [assignOpen, setAssignOpen] = useState(false);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [selectedCounselorId, setSelectedCounselorId] = useState("");

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
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  async function openAssign() {
    setAssignOpen(true);
    try {
      const res = await fetch(`/api/care/companions?churchId=${churchId}`);
      const json = await res.json();
      setCounselors(json?.msdpMembers ?? []);
    } catch { /* ignore */ }
  }

  const nextAction = NEXT_ACTION[status];

  return (
    <div className="space-y-4">
      {isManager && (status === "SUBMITTED" || status === "ASSIGNED") && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {assignOpen ? (
            <div className="space-y-3">
              <select
                value={selectedCounselorId}
                onChange={(e) => setSelectedCounselorId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
              >
                <option value="">— Sélectionner un conseiller —</option>
                {counselors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.email}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="sm" disabled={!selectedCounselorId || loading}
                  onClick={() => patch({ action: "assign_counselor", counselorId: selectedCounselorId })}>
                  Confirmer
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={openAssign}>Assigner un conseiller</Button>
          )}
        </div>
      )}

      {nextAction && (
        <Button size="sm" disabled={loading} onClick={() => patch({ action: nextAction.action })}>
          {nextAction.label}
        </Button>
      )}

      {status !== "COMPLETED" && status !== "ABANDONED" && (
        <Button size="sm" variant="danger" disabled={loading}
          onClick={() => { if (confirm("Abandonner ce suivi ?")) patch({ action: "abandon" }); }}>
          Abandonner
        </Button>
      )}

      {status === "ABANDONED" && isManager && (
        <Button size="sm" disabled={loading} onClick={() => patch({ action: "reopen" })}>
          Rouvrir
        </Button>
      )}

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

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
