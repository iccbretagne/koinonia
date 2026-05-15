"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface PastoralProfile { id: string; name: string; role: string }
interface Qualifier { id: string; name: string | null; displayName: string | null }
interface ValidatedRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  subject: string;
  qualificationNote: string | null;
  qualifiedAt: Date | null;
  assignedTo: PastoralProfile | null;
  qualifiedBy: Qualifier | null;
}

interface Props { requests: ValidatedRequest[] }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function ScheduleDashboard({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { startsAt: string; endsAt: string; location: string }>>({});

  function getForm(id: string) {
    return forms[id] ?? { startsAt: "", endsAt: "", location: "" };
  }

  function setField(id: string, field: string, value: string) {
    setForms((prev) => ({ ...prev, [id]: { ...getForm(id), [field]: value } }));
  }

  async function schedule(id: string) {
    const f = getForm(id);
    if (!f.startsAt) { alert("La date de début est requise."); return; }
    setProcessing(id);
    try {
      const res = await fetch(`/api/agenda/requests/${id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: new Date(f.startsAt).toISOString(),
          endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
          location: f.location || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch { alert("Erreur réseau"); }
    finally { setProcessing(null); }
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">Aucune demande à planifier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((req) => {
        const f = getForm(req.id);
        const profile = req.assignedTo;
        return (
          <div key={req.id} className="bg-white rounded-lg shadow border border-gray-100 p-5">
            <div className="mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{req.firstName} {req.lastName}</p>
                  {req.email && <p className="text-xs text-gray-500">{req.email}</p>}
                  <p className="text-sm font-medium text-gray-700 mt-1">{req.subject}</p>
                </div>
                {profile && (
                  <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-1 rounded-full shrink-0">
                    {profile.name} · {ROLE_LABELS[profile.role] ?? profile.role}
                  </span>
                )}
              </div>
              {req.qualificationNote && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                  <span className="font-medium">Note Qualificateur :</span> {req.qualificationNote}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Date et heure de début <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={f.startsAt}
                    onChange={(e) => setField(req.id, "startsAt", e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Heure de fin (optionnel)
                  </label>
                  <input
                    type="datetime-local"
                    value={f.endsAt}
                    onChange={(e) => setField(req.id, "endsAt", e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lieu (optionnel)</label>
                <input
                  type="text"
                  value={f.location}
                  onChange={(e) => setField(req.id, "location", e.target.value)}
                  placeholder="Salle, adresse..."
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-icc-violet"
                />
              </div>
              <Button size="sm" onClick={() => schedule(req.id)} disabled={processing === req.id}>
                ✓ Planifier
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
