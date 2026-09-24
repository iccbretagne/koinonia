"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

interface Profile { id: string; name: string; role: string }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function RequestActions({ requestId, profiles }: { readonly requestId: string; readonly profiles: Profile[] }) {
  const router = useRouter();
  const [assignedToId, setAssignedToId] = useState("");
  const [qualificationNote, setQualificationNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "validate" | "reject") {
    if (action === "validate" && !assignedToId) {
      setError("Veuillez sélectionner un profil pastoral.");
      return;
    }
    if (action === "reject" && !confirm("Rejeter définitivement cette demande ?")) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "validate"
            ? { action: "validate", assignedToId, qualificationNote: qualificationNote || null }
            : { action: "reject", rejectReason: rejectReason || null }
        ),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erreur"); return; }
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setProcessing(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Profil pastoral <span className="text-red-500">*</span>
        </label>
        <select
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        >
          <option value="">— Sélectionner —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role] ?? p.role})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Note transmise à l&apos;accompagnant (optionnel)</label>
        <textarea
          value={qualificationNote}
          onChange={(e) => setQualificationNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Motif de refus (si applicable)</label>
        <input
          type="text"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act("validate")} disabled={processing}>✓ Confier</Button>
        <Button size="sm" variant="danger" onClick={() => act("reject")} disabled={processing}>Rejeter</Button>
      </div>
    </div>
  );
}
