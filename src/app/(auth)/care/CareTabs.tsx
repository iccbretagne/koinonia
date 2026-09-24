"use client";

import { useState } from "react";
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
  VALIDATED: "Validée",
  SCHEDULED: "Planifiée",
  CLOSED: "Terminée",
  REJECTED: "Refusée",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VALIDATED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-600",
  REJECTED: "bg-red-100 text-red-700",
};

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Reçu",
  ASSIGNED: "Conseiller assigné",
  CONTACTED: "Contacté",
  IN_FORMATION: "En formation",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-indigo-100 text-indigo-800",
  IN_FORMATION: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ABANDONED: "bg-red-100 text-red-600",
};

function QualifyForm({ req, churchId, onDone }: {
  readonly req: AppointmentRequestItem;
  readonly churchId: string;
  readonly onDone: (id: string) => void;
}) {
  const [assignee, setAssignee] = useState<AssigneeValue | null>(null);
  const [note, setNote] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);

  async function validate() {
    if (!assignee) {
      alert("Veuillez sélectionner un accompagnant.");
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
          <Button size="sm" variant="secondary" onClick={() => setRejectMode(false)}>Annuler</Button>
        </div>
      </div>
    );
  }

  return (
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
        <p className="text-sm text-gray-400">Aucune demande en attente de qualification.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((req) => (
            <div key={req.id} className="bg-white rounded-lg shadow border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{req.firstName} {req.lastName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{req.email} {req.phone && `· ${req.phone}`}</p>
                  {!req.masked && <p className="text-sm font-medium text-gray-700 mt-1">{req.subject}</p>}
                  {!req.masked && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{req.message}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(req.createdAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3 mt-3">
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
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Autres demandes</h3>
          <div className="space-y-2">
            {others.map((req) => (
              <Link
                key={req.id}
                href={`/care/requests/${req.id}`}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-icc-violet transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">{req.firstName} {req.lastName}</p>
                  <p className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${REQUEST_STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-500"}`}>
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
    return <p className="text-sm text-gray-400">Aucun suivi de nouveau converti.</p>;
  }
  return (
    <div className="space-y-2">
      {followUps.map((f) => {
        const name = f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : `${f.request?.firstName ?? ""} ${f.request?.lastName ?? ""}`.trim();
        return (
          <Link
            key={f.id}
            href={`/care/followups/${f.id}`}
            className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-icc-violet transition-colors"
          >
            <div>
              <p className="font-medium text-gray-900">{name || "—"}</p>
              <p className="text-xs text-gray-400">
                {f.assignedConseillerMsdp ? `Conseiller : ${f.assignedConseillerMsdp.name ?? f.assignedConseillerMsdp.email}` : "Sans conseiller"}
              </p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${MSDP_STATUS_COLORS[f.status] ?? "bg-gray-100 text-gray-500"}`}>
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
      <div className="flex gap-2 border-b border-gray-200 mb-5">
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "requests" ? "border-icc-violet text-icc-violet" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Rendez-vous {requests.filter((r) => r.status === "PENDING").length > 0 && canQualify && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-icc-violet text-white">
              {requests.filter((r) => r.status === "PENDING").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("followups")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "followups" ? "border-icc-violet text-icc-violet" : "border-transparent text-gray-500 hover:text-gray-700"
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
