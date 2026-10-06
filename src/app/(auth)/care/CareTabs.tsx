"use client";

import { useId, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AssigneeSelect, { type AssigneeValue } from "./AssigneeSelect";

const REJECT_REASON_OPTIONS: [string, string][] = [
  ["OUT_OF_SCOPE", "Hors du champ pastoral"],
  ["DUPLICATE", "Doublon"],
  ["WITHDRAWN", "Demande retirée par la personne"],
  ["UNREACHABLE", "Injoignable"],
  ["REDIRECTED", "Orientée vers un autre service"],
  ["OTHER", "Autre"],
];

interface Requester { id: string; name: string | null; displayName: string | null }
interface AppointmentRequestItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  subject?: string;
  message?: string | null;
  masked: boolean;
  createdAt: Date | string;
  user: Requester | null;
}
interface FollowUpItem {
  id: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date | string;
  assignedConseillerMsdp: { id: string; name: string | null; email: string | null } | null;
  assignedProfile: { id: string; name: string } | null;
  request: { id: string; firstName: string; lastName: string } | null;
}

interface Props {
  readonly churchId: string;
  readonly canQualify: boolean;
  readonly requests: AppointmentRequestItem[];
  readonly followUps: FollowUpItem[];
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Confiée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning",
  VALIDATED: "bg-info-soft text-info",
  SCHEDULED: "bg-success-soft text-success",
  CLOSED: "bg-surface-sunken text-ink-muted",
  REJECTED: "bg-danger-soft text-danger",
};

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Référent assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-warning-soft text-warning",
  ASSIGNED: "bg-info-soft text-info",
  CONTACTED: "bg-info-soft text-info",
  IN_FORMATION: "bg-brand-soft text-brand-text",
  COMPLETED: "bg-success-soft text-success",
  ABANDONED: "bg-danger-soft text-danger",
};

function QualifyForm({ req, churchId, onDone }: {
  readonly req: AppointmentRequestItem;
  readonly churchId: string;
  readonly onDone: (id: string) => void;
}) {
  const uid = useId();
  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [note, setNote] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);

  async function validate() {
    if (!assignee) {
      alert("Veuillez sélectionner un référent.");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`/api/care/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", assignee, note: note || undefined }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      onDone(req.id);
    } catch { alert("Erreur réseau"); }
    finally { setProcessing(false); }
  }

  async function reject() {
    if (!reasonCode) { alert("Veuillez sélectionner un motif."); return; }
    if (!confirm("Rejeter définitivement cette demande ?")) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/care/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reasonCode, comment: comment || undefined }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      onDone(req.id);
    } catch { alert("Erreur réseau"); }
    finally { setProcessing(false); }
  }

  if (rejectMode) {
    return (
      <div className="space-y-3">
        <div>
          <label htmlFor={`${uid}-reason`} className="block text-xs font-medium text-ink-muted mb-1">
            Motif de refus <span className="text-danger">*</span>
          </label>
          <select
            id={`${uid}-reason`}
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand"
          >
            <option value="">— Sélectionner —</option>
            {REJECT_REASON_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-comment`} className="block text-xs font-medium text-ink-muted mb-1">Commentaire (optionnel)</label>
          <textarea
            id={`${uid}-comment`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand resize-none"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" onClick={reject} disabled={processing}>Confirmer le refus</Button>
          <Button size="sm" variant="secondary" onClick={() => setRejectMode(false)}>Annuler</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${uid}-assignee`} className="block text-xs font-medium text-ink-muted mb-1">
          Référent <span className="text-danger">*</span>
        </label>
        <AssigneeSelect id={`${uid}-assignee`} churchId={churchId} value={assignee} onChange={setAssignee} />
      </div>
      <div>
        <label htmlFor={`${uid}-note`} className="block text-xs font-medium text-ink-muted mb-1">
          Note transmise au référent (optionnel)
        </label>
        <textarea
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={validate} disabled={processing}>✓ Confier</Button>
        <Button size="sm" variant="danger" onClick={() => setRejectMode(true)} disabled={processing}>Rejeter</Button>
      </div>
    </div>
  );
}

function RequestsTab({ requests: initial, churchId }: { readonly requests: AppointmentRequestItem[]; readonly churchId: string }) {
  const [requests, setRequests] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "PENDING");
  const others = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <p className="text-sm text-ink-subtle">Aucune demande en attente de qualification.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((req) => (
            <div key={req.id} className="bg-surface rounded-lg shadow border border-line p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{req.firstName} {req.lastName}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{req.email} {req.phone && `· ${req.phone}`}</p>
                  {!req.masked && <p className="text-sm font-medium text-ink-muted mt-1">{req.subject}</p>}
                  {!req.masked && <p className="text-sm text-ink-muted mt-1 whitespace-pre-line">{req.message}</p>}
                </div>
                <span className="text-xs text-ink-subtle shrink-0">
                  {new Date(req.createdAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div className="border-t border-line pt-3 mt-3">
                {expanded === req.id ? (
                  <QualifyForm
                    req={req}
                    churchId={churchId}
                    onDone={(id) => { setRequests((prev) => prev.filter((r) => r.id !== id)); setExpanded(null); }}
                  />
                ) : (
                  <Button size="sm" variant="info" onClick={() => setExpanded(req.id)}>Traiter</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-muted mb-2">Autres demandes</h3>
          <div className="space-y-2">
            {others.map((req) => (
              <Link
                key={req.id}
                href={`/care/requests/${req.id}`}
                className="flex items-center justify-between gap-3 bg-surface rounded-lg border border-line px-4 py-3 hover:border-brand transition-colors"
              >
                <div>
                  <p className="font-medium text-ink">{req.firstName} {req.lastName}</p>
                  <p className="text-xs text-ink-subtle">{new Date(req.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${REQUEST_STATUS_COLORS[req.status] ?? "bg-surface-sunken text-ink-muted"}`}>
                  {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FollowupsTab({ followUps }: { readonly followUps: FollowUpItem[] }) {
  if (followUps.length === 0) {
    return <p className="text-sm text-ink-subtle">Aucun suivi de nouveau converti.</p>;
  }
  return (
    <div className="space-y-2">
      {followUps.map((f) => {
        const name = f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : `${f.request?.firstName ?? ""} ${f.request?.lastName ?? ""}`.trim();
        // Référent : membre du MSDP ou profil pastoral, l'un ou l'autre, jamais les deux.
        const referent = f.assignedConseillerMsdp
          ? f.assignedConseillerMsdp.name ?? f.assignedConseillerMsdp.email
          : f.assignedProfile?.name ?? null;
        return (
          <Link
            key={f.id}
            href={`/care/followups/${f.id}`}
            className="flex items-center justify-between gap-3 bg-surface rounded-lg border border-line px-4 py-3 hover:border-brand transition-colors"
          >
            <div>
              <p className="font-medium text-ink">{name || "—"}</p>
              <p className="text-xs text-ink-subtle">
                {referent ? `Référent : ${referent}` : "Sans référent"}
              </p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${MSDP_STATUS_COLORS[f.status] ?? "bg-surface-sunken text-ink-muted"}`}>
              {MSDP_STATUS_LABELS[f.status] ?? f.status}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function CareTabs({ canQualify, requests, followUps, churchId }: Props) {
  const [tab, setTab] = useState<"requests" | "followups">("requests");

  return (
    <div>
      <div className="flex gap-2 border-b border-line mb-5">
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "requests" ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink-muted"
          }`}
        >
          Rendez-vous {requests.filter((r) => r.status === "PENDING").length > 0 && canQualify && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-brand text-on-brand">
              {requests.filter((r) => r.status === "PENDING").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("followups")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "followups" ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink-muted"
          }`}
        >
          Nouveaux convertis
        </button>
      </div>
      {tab === "requests" ? (
        <RequestsTab requests={requests} churchId={churchId} />
      ) : (
        <FollowupsTab followUps={followUps} />
      )}
    </div>
  );
}
