"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Profile { id: string; name: string; role: string }
interface Requester { id: string; name: string | null; displayName: string | null }
interface AppointmentRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  preferredDays: string | null;
  createdAt: Date;
  user: Requester | null;
}

interface Props {
  churchId: string;
  requests: AppointmentRequest[];
  profiles: Profile[];
}

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function QualificationDashboard({ requests: initial, profiles }: Props) {
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { assignedToId: string; qualificationNote: string; rejectReason: string }>>({});

  function getForm(id: string) {
    return form[id] ?? { assignedToId: "", qualificationNote: "", rejectReason: "" };
  }

  function setField(id: string, field: string, value: string) {
    setForm((prev) => ({ ...prev, [id]: { ...getForm(id), [field]: value } }));
  }

  async function qualify(id: string, action: "VALIDATE" | "REJECT") {
    const f = getForm(id);
    if (action === "VALIDATE" && !f.assignedToId) {
      alert("Veuillez sélectionner un profil pastoral.");
      return;
    }
    setProcessing(id);
    try {
      const res = await fetch(`/api/agenda/requests/${id}/qualify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "VALIDATE"
            ? { action: "VALIDATE", assignedToId: f.assignedToId, qualificationNote: f.qualificationNote || null }
            : { action: "REJECT", rejectReason: f.rejectReason || null }
        ),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setExpanded(null);
    } catch { alert("Erreur réseau"); }
    finally { setProcessing(null); }
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">Aucune demande en attente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((req) => {
        const f = getForm(req.id);
        const isOpen = expanded === req.id;
        return (
          <div key={req.id} className="bg-white rounded-lg shadow border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{req.firstName} {req.lastName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {req.email} {req.phone && `· ${req.phone}`}
                  {req.preferredDays && ` · Disponibilités : ${req.preferredDays}`}
                </p>
                <p className="text-sm font-medium text-gray-700 mt-1">{req.subject}</p>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{req.message}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(req.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>

            <div className="border-t border-gray-100 pt-3 mt-3">
              {isOpen ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Profil pastoral <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={f.assignedToId}
                      onChange={(e) => setField(req.id, "assignedToId", e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                    >
                      <option value="">— Sélectionner —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role] ?? p.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Motif transmis au Protocole (optionnel)
                    </label>
                    <textarea
                      value={f.qualificationNote}
                      onChange={(e) => setField(req.id, "qualificationNote", e.target.value)}
                      rows={2}
                      placeholder="Contexte pour le Protocole..."
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Motif de refus (si applicable)
                    </label>
                    <input
                      type="text"
                      value={f.rejectReason}
                      onChange={(e) => setField(req.id, "rejectReason", e.target.value)}
                      placeholder="Raison du refus..."
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => qualify(req.id, "VALIDATE")} disabled={processing === req.id}>
                      ✓ Valider
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => qualify(req.id, "REJECT")} disabled={processing === req.id}>
                      Rejeter
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setExpanded(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="info" onClick={() => setExpanded(req.id)}>
                  Traiter
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
