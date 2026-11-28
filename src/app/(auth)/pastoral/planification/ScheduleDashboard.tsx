"use client";

import { useId, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Alert, Button, EmptyState, Input, StatusChip, useToast } from "@/components/ui";

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

interface Props { readonly requests: ValidatedRequest[] }

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};

export default function ScheduleDashboard({ requests: initial }: Props) {
  const id = useId();
  const toast = useToast();
  const [requests, setRequests] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [forms, setForms] = useState<Record<string, { startsAt: string; endsAt: string; location: string }>>({});

  function getForm(id: string) {
    return forms[id] ?? { startsAt: "", endsAt: "", location: "" };
  }

  function setField(id: string, field: string, value: string) {
    setForms((prev) => ({ ...prev, [id]: { ...getForm(id), [field]: value } }));
  }

  function setError(id: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function schedule(id: string) {
    const f = getForm(id);
    if (!f.startsAt) { setError(id, "La date de début est requise."); return; }
    setProcessing(id);
    setError(id, null);
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
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(id, d.error || "La planification a échoué. Veuillez réessayer.");
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rendez-vous planifié");
    } catch {
      setError(id, "Erreur réseau. Veuillez réessayer.");
    } finally {
      setProcessing(null);
    }
  }

  if (requests.length === 0) {
    return <EmptyState icon={CalendarCheck} title="Aucune demande à planifier" />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {requests.map((req) => {
        const f = getForm(req.id);
        const profile = req.assignedTo;
        const error = errors[req.id];
        return (
          <li key={req.id} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-semibold text-ink">{req.firstName} {req.lastName}</h2>
                  {req.email && <p className="text-xs text-ink-muted">{req.email}</p>}
                  <p className="mt-1 text-sm font-medium text-ink-muted">{req.subject}</p>
                </div>
                {profile && (
                  <StatusChip tone="brand" className="shrink-0">
                    {profile.name} · {ROLE_LABELS[profile.role] ?? profile.role}
                  </StatusChip>
                )}
              </div>
              {req.qualificationNote && (
                <Alert tone="info" title="Note du référent">{req.qualificationNote}</Alert>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  id={`${id}-${req.id}-f1`}
                  label="Date et heure de début"
                  type="datetime-local"
                  required
                  value={f.startsAt}
                  onChange={(e) => setField(req.id, "startsAt", e.target.value)}
                />
                <Input
                  id={`${id}-${req.id}-f2`}
                  label="Heure de fin (facultatif)"
                  type="datetime-local"
                  value={f.endsAt}
                  onChange={(e) => setField(req.id, "endsAt", e.target.value)}
                />
              </div>
              <Input
                id={`${id}-${req.id}-f3`}
                label="Lieu (facultatif)"
                type="text"
                value={f.location}
                onChange={(e) => setField(req.id, "location", e.target.value)}
                placeholder="Salle, adresse…"
              />
              {error && <Alert tone="danger">{error}</Alert>}
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                {!f.startsAt && (
                  <p className="text-xs text-ink-muted">Indiquez la date de début pour planifier.</p>
                )}
                <Button
                  variant="secondary"
                  onClick={() => schedule(req.id)}
                  disabled={processing === req.id || !f.startsAt}
                >
                  {processing === req.id ? "Planification en cours…" : "Planifier le rendez-vous"}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
